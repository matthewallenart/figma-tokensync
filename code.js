// Figma Plugin: Styles & Variables Exporter
// Compatible with documentAccess: dynamic-page

figma.showUI(__html__, { width: 400, height: 600 });

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'export-data') {
    try {
      figma.ui.postMessage({ type: 'export-start' });
      const data = await exportStylesAndVariables();
      figma.ui.postMessage({ type: 'export-complete', data });
    } catch (error) {
      console.error('Export error:', error);
      figma.ui.postMessage({ 
        type: 'export-error', 
        message: error.message || 'An unexpected error occurred during export'
      });
    }
  }
};

async function exportStylesAndVariables() {
  const data = {
    styles: {
      colors: [],
      textStyles: [],
      effectStyles: [],
      gridStyles: []
    },
    collections: {}, // Group variables by collection
    metadata: {
      exportDate: new Date().toISOString(),
      figmaFileKey: figma.fileKey || 'unknown',
      fileName: figma.root.name || 'Untitled',
      pluginVersion: '1.0.0'
    }
  };

  try {
    // Use Promise.all for parallel async operations to improve performance
    const [
      paintStyles,
      textStyles, 
      effectStyles,
      gridStyles,
      variables,
      collections
    ] = await Promise.all([
      figma.getLocalPaintStylesAsync(),
      figma.getLocalTextStylesAsync(), 
      figma.getLocalEffectStylesAsync(),
      figma.getLocalGridStylesAsync(),
      figma.variables.getLocalVariablesAsync(),
      figma.variables.getLocalVariableCollectionsAsync()
    ]);

    console.log(`Found ${collections.length} collections, ${variables.length} variables total`);

    // Process color styles
    for (const style of paintStyles) {
      try {
        const colorData = await processColorStyle(style);
        if (colorData) {
          data.styles.colors.push(colorData);
        }
      } catch (error) {
        console.warn(`Failed to process color style ${style.name}:`, error);
      }
    }

    // Process text styles
    for (const style of textStyles) {
      try {
        const textData = await processTextStyle(style);
        if (textData) {
          data.styles.textStyles.push(textData);
        }
      } catch (error) {
        console.warn(`Failed to process text style ${style.name}:`, error);
      }
    }

    // Process effect styles
    for (const style of effectStyles) {
      try {
        const effectData = await processEffectStyle(style);
        if (effectData) {
          data.styles.effectStyles.push(effectData);
        }
      } catch (error) {
        console.warn(`Failed to process effect style ${style.name}:`, error);
      }
    }

    // Process grid styles
    for (const style of gridStyles) {
      try {
        const gridData = await processGridStyle(style);
        if (gridData) {
          data.styles.gridStyles.push(gridData);
        }
      } catch (error) {
        console.warn(`Failed to process grid style ${style.name}:`, error);
      }
    }

    // Create collection lookup map and initialize collection structure
    const collectionMap = new Map();
    collections.forEach(collection => {
      collectionMap.set(collection.id, collection);
      
      // Debug collection modes
      console.log(`Collection "${collection.name}" modes:`, collection.modes);
      
      // Include all collections (remove underscore filtering)
      if (collection.name) {
        data.collections[collection.name] = {
          id: collection.id,
          modes: collection.modes.map(mode => {

            return {
              id: mode.modeId || mode.id,
              name: mode.name || `Mode ${mode.modeId || mode.id}`
            };
          }),
          variables: {
            colors: [],
            numbers: [],
            strings: [],
            booleans: []
          }
        };
      }
    });

    // Process variables and group by collection
    let processedCount = 0;
    let skippedCount = 0;
    const processedVariableNames = new Set(); // Track processed variables to avoid duplicates
    
    for (const variable of variables) {
      try {
        const collection = collectionMap.get(variable.variableCollectionId);
        const collectionName = (collection && collection.name) ? collection.name : 'Other';
        
        // Skip duplicate variables (same name in same collection)
        const variableKey = `${collectionName}:${variable.name}`;
        if (processedVariableNames.has(variableKey)) {
          console.log(`  Skipping duplicate variable: "${variable.name}" in "${collectionName}"`);
          skippedCount++;
          continue;
        }
        
        const varData = await processVariable(variable, collectionMap);
        if (varData) {
          processedVariableNames.add(variableKey);
          processedCount++;
          
          // Ensure collection exists in data structure
          if (!data.collections[collectionName]) {
            data.collections[collectionName] = {
              id: variable.variableCollectionId,
              modes: collection ? collection.modes.map(mode => ({
                id: mode.modeId || mode.id,
                name: mode.name || `Mode ${mode.modeId || mode.id}`
              })) : [],
              variables: {
                colors: [],
                numbers: [],
                strings: [],
                booleans: []
              }
            };
          }
          
          // Add variable to appropriate collection and type
          switch (varData.type) {
            case 'color':
              data.collections[collectionName].variables.colors.push(varData);
              break;
            case 'float':
              data.collections[collectionName].variables.numbers.push(varData);
              break;
            case 'string':
              data.collections[collectionName].variables.strings.push(varData);
              break;
            case 'boolean':
              data.collections[collectionName].variables.booleans.push(varData);
              break;
          }
        } else {
          const collection = collectionMap.get(variable.variableCollectionId);
          const collectionName = (collection && collection.name) ? collection.name : 'Unknown';

          skippedCount++;
        }
      } catch (error) {
        console.warn(`Failed to process variable ${variable.name}:`, error);
        skippedCount++;
      }
    }
    
    console.log(`Variable processing complete: ${processedCount} processed, ${skippedCount} skipped`);



    // Remove empty collections (but let's be more conservative)
    const collectionsToRemove = [];
    Object.keys(data.collections).forEach(collectionName => {
      const collection = data.collections[collectionName];
      const totalVariables = collection.variables.colors.length + 
                           collection.variables.numbers.length + 
                           collection.variables.strings.length + 
                           collection.variables.booleans.length;
      
      if (totalVariables === 0) {
        console.log(`Removing empty collection: "${collectionName}"`);
        collectionsToRemove.push(collectionName);
      }
    });
    
    collectionsToRemove.forEach(name => {
      delete data.collections[name];
    });

    // Add collection summary to metadata
    data.metadata.collectionsFound = collections.length;
    data.metadata.collectionsExported = Object.keys(data.collections).length;
    
    // Final debug summary
    console.log(`Export Summary:`);
    console.log(`- Collections found: ${collections.length}`);
    console.log(`- Collections exported: ${Object.keys(data.collections).length}`);
    console.log(`- Exported collection names:`, Object.keys(data.collections));
    console.log(`- Full collections object:`, JSON.stringify(data.collections, null, 2));
    
    Object.keys(data.collections).forEach(name => {
      const collection = data.collections[name];
      const varCount = collection.variables.colors.length + 
                      collection.variables.numbers.length + 
                      collection.variables.strings.length + 
                      collection.variables.booleans.length;
      console.log(`  - "${name}": ${varCount} variables`);
    });

  } catch (error) {
    console.error('Error during export process:', error);
    throw new Error('Failed to export styles and variables. Please ensure the file has loaded completely and try again.');
  }

  // Final data structure check before return
  console.log('Final data structure keys:', Object.keys(data));
  console.log('Collections in final data:', data.collections ? Object.keys(data.collections) : 'MISSING');

  return data;
}

// Helper function to convert Figma RGB (0-1) to standard RGB (0-255)
function figmaRgbToStandardRgb(figmaColor) {
  return {
    r: Math.round(figmaColor.r * 255),
    g: Math.round(figmaColor.g * 255),
    b: Math.round(figmaColor.b * 255)
  };
}

// Helper function to convert Figma RGBA to standard RGBA
function figmaRgbaToStandardRgba(figmaColor) {
  // Validate input
  if (!figmaColor || typeof figmaColor !== 'object') {
    return { r: 0, g: 0, b: 0, a: 1 };
  }

  // Ensure color values are valid numbers between 0 and 1
  const r = Math.max(0, Math.min(1, figmaColor.r || 0));
  const g = Math.max(0, Math.min(1, figmaColor.g || 0));
  const b = Math.max(0, Math.min(1, figmaColor.b || 0));
  const a = figmaColor.a !== undefined ? Math.max(0, Math.min(1, figmaColor.a)) : 1;

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
    a: Math.round(a * 100) / 100 // Round to 2 decimal places
  };
}

async function processColorStyle(style) {
  if (!style.paints || style.paints.length === 0) {
    return null;
  }

  const paint = style.paints[0];
  const result = {
    name: style.name,
    token: generateToken(style.name),
    type: paint.type.toLowerCase()
  };

  // Only include description if it exists and isn't empty
  if (style.description && style.description.trim()) {
    result.description = style.description.trim();
  }

  switch (paint.type) {
    case 'SOLID':
      const opacity = paint.opacity !== undefined ? 
        Math.round(paint.opacity * 100) / 100 : 1; // Round to 2 decimal places
      
      if (opacity < 1) {
        const rgba = figmaRgbaToStandardRgba(paint.color);
        result.value = `rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, ${opacity})`;
      } else {
        const hex = rgbToHex(paint.color);
        if (!hex) {
          return null; // Skip color styles with invalid colors
        }
        result.value = hex;
      }
      break;
      
    case 'GRADIENT_LINEAR':
    case 'GRADIENT_RADIAL':
    case 'GRADIENT_ANGULAR':
    case 'GRADIENT_DIAMOND':
      // Validate gradient stops first
      if (!paint.gradientStops || paint.gradientStops.length === 0) {
        return null; // Skip gradients with no stops
      }
      
      const validStops = paint.gradientStops.filter(stop => {
        const hex = rgbToHex(stop.color);
        return hex !== null; // Only include stops with valid colors
      });
      
      if (validStops.length === 0) {
        return null; // Skip gradients with no valid color stops
      }
      
      result.value = generateGradientCSS(paint);
      result.stops = validStops.map(stop => ({
        color: rgbToHex(stop.color),
        position: Math.round(stop.position * 100) + '%'
      }));
      break;
      
    case 'IMAGE':
      result.value = 'image';
      result.scaleMode = paint.scaleMode || 'fill';
      break;
      
    default:
      result.value = 'transparent';
  }

  return result;
}

async function processTextStyle(style) {
  const result = {
    name: style.name,
    token: generateToken(style.name),
    type: 'text'
  };

  // Only include description if it exists and isn't empty
  if (style.description && style.description.trim()) {
    result.description = style.description.trim();
  }

  // Add font properties only if they exist
  if (style.fontName && style.fontName.family) {
    result.fontFamily = style.fontName.family;
  }

  if (style.fontName && style.fontName.style) {
    const weight = parseFontWeight(style.fontName.style);
    if (weight) result.fontWeight = weight;
    
    if (style.fontName.style.toLowerCase().includes('italic')) {
      result.fontStyle = 'italic';
    }
  }

  if (style.fontSize) {
    result.fontSize = style.fontSize + 'px';
  }

  if (style.lineHeight && typeof style.lineHeight === 'object') {
    if (style.lineHeight.unit === 'PIXELS') {
      result.lineHeight = style.lineHeight.value + 'px';
    } else if (style.lineHeight.unit === 'PERCENT') {
      result.lineHeight = (style.lineHeight.value / 100);
    }
  }

  if (style.letterSpacing && typeof style.letterSpacing === 'object') {
    if (style.letterSpacing.unit === 'PIXELS') {
      result.letterSpacing = style.letterSpacing.value + 'px';
    } else if (style.letterSpacing.unit === 'PERCENT') {
      result.letterSpacing = style.letterSpacing.value + '%';
    }
  }

  if (style.textCase && style.textCase !== 'ORIGINAL') {
    result.textTransform = style.textCase.toLowerCase().replace('_', '-');
  }

  if (style.textDecoration && style.textDecoration !== 'NONE') {
    result.textDecoration = style.textDecoration.toLowerCase().replace('_', '-');
  }

  return result;
}

async function processEffectStyle(style) {
  // Skip effect styles with no effects
  if (!style.effects || style.effects.length === 0) {
    return null;
  }

  const cssValue = generateEffectCSS(style.effects);
  // Skip if no valid CSS was generated
  if (!cssValue || cssValue.trim() === '') {
    return null;
  }

  const result = {
    name: style.name,
    token: generateToken(style.name),
    type: 'effect',
    value: cssValue
  };

  // Only include description if it exists and isn't empty
  if (style.description && style.description.trim()) {
    result.description = style.description.trim();
  }

  // Add simplified effects array for easier parsing
  if (style.effects && style.effects.length > 0) {
    result.effects = style.effects.map(effect => {
      const cleanEffect = {
        type: effect.type.toLowerCase().replace('_', '-')
      };

      if (effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW') {
        cleanEffect.x = (effect.offset && effect.offset.x) || 0;
        cleanEffect.y = (effect.offset && effect.offset.y) || 0;
        cleanEffect.blur = effect.radius || 0;
        cleanEffect.spread = effect.spread || 0;
        
        if (effect.color) {
          const opacity = effect.color.a !== undefined ? 
            Math.round(effect.color.a * 100) / 100 : 1; // Round to 2 decimal places
          
          if (opacity < 1) {
            const rgba = figmaRgbaToStandardRgba(effect.color);
            cleanEffect.color = `rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, ${opacity})`;
          } else {
            const hex = rgbToHex(effect.color);
            cleanEffect.color = hex || 'transparent';
          }
        }
      }

      return cleanEffect;
    });
  }

  return result;
}

async function processGridStyle(style) {
  // Skip grid styles with no layout grids
  if (!style.layoutGrids || style.layoutGrids.length === 0) {
    return null;
  }

  const result = {
    name: style.name,
    token: generateToken(style.name),
    type: 'grid'
  };

  // Only include description if it exists and isn't empty
  if (style.description && style.description.trim()) {
    result.description = style.description.trim();
  }

  // Add structured grid configuration
  if (style.layoutGrids && style.layoutGrids.length > 0) {
    result.grids = style.layoutGrids.map(grid => ({
      pattern: grid.pattern.toLowerCase(),
      count: grid.count || 12,
      gutter: grid.gutterSize || 20,
      margin: grid.offset || 0
    }));
  }

  return result;
}

async function processVariable(variable, collectionMap) {
  const collection = collectionMap.get(variable.variableCollectionId);
  

  
  // Convert values for all modes
  const convertedValues = {};
  let hasValidValue = false;
  
  for (const [modeId, rawValue] of Object.entries(variable.valuesByMode)) {
    let cleanValue = null;
    let actualValue = rawValue;
    
    // Check if this is an alias (reference to another variable)
    if (rawValue && typeof rawValue === 'object' && rawValue.type === 'VARIABLE_ALIAS') {
      
      try {
        // Try to resolve the alias to get the actual variable
        const aliasedVariable = await figma.variables.getVariableByIdAsync(rawValue.id);
        if (aliasedVariable) {
          // Get the value from the aliased variable for the same mode
          actualValue = aliasedVariable.valuesByMode[modeId];

          
          // If the aliased variable doesn't have this mode, try the default mode
          if (actualValue === undefined && aliasedVariable.valuesByMode) {
            const firstModeId = Object.keys(aliasedVariable.valuesByMode)[0];
            actualValue = aliasedVariable.valuesByMode[firstModeId];
            console.log(`    Using default mode value:`, actualValue);
          }
        } else {
          console.log(`    Could not resolve alias`);
          continue;
        }
      } catch (error) {
        console.warn(`    Failed to resolve alias:`, error);
        continue;
      }
    }
    
    switch (variable.resolvedType) {
      case 'COLOR':
        console.log(`  Processing COLOR "${variable.name}" mode ${modeId}:`, actualValue);
        if (actualValue && typeof actualValue === 'object') {
          const rgba = figmaRgbaToStandardRgba(actualValue);
          if (rgba.a < 1) {
            cleanValue = `rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, ${rgba.a})`;
            hasValidValue = true;

          } else {
            const hex = rgbToHex({ r: actualValue.r, g: actualValue.g, b: actualValue.b });
            if (hex) {
              cleanValue = hex;
              hasValidValue = true;

            } else {
              console.log(`    ✗ COLOR value rejected - invalid hex conversion`);
            }
          }
        } else {

        }
        break;
      case 'FLOAT':
        // Be more lenient with FLOAT validation
        if (actualValue !== undefined && actualValue !== null && (typeof actualValue === 'number' || !isNaN(parseFloat(actualValue)))) {
          cleanValue = typeof actualValue === 'number' ? actualValue : parseFloat(actualValue);
          hasValidValue = true;
        }
        break;
      case 'STRING':
        if (actualValue !== undefined && actualValue !== null && actualValue !== '') {
          cleanValue = actualValue;
          hasValidValue = true;
        }
        break;
      case 'BOOLEAN':
        if (actualValue !== undefined && actualValue !== null) {
          cleanValue = actualValue;
          hasValidValue = true;
        }
        break;
      default:
        if (actualValue !== undefined && actualValue !== null) {
          cleanValue = actualValue;
          hasValidValue = true;
        }
    }
    
    if (cleanValue !== null) {
      // Get mode name from collection
      const mode = collection && collection.modes ? 
        collection.modes.find(m => m.id === modeId || m.modeId === modeId) : null;
      const modeName = (mode && mode.name) || `Mode ${modeId}`;
      
      convertedValues[modeName] = cleanValue;
    }
  }
  
  // Skip variables with no valid values
  if (!hasValidValue || Object.keys(convertedValues).length === 0) {
    return null;
  }
  
  // Return clean, developer-friendly structure
  const result = {
    name: variable.name,
    token: generateToken(variable.name),
    type: variable.resolvedType.toLowerCase()
  };
  
  // Add a default value (first valid mode)
  result.value = Object.values(convertedValues)[0];
  
  // Only include values object if there are multiple modes or meaningful mode names
  const modeNames = Object.keys(convertedValues);
  const hasMultipleModes = modeNames.length > 1;
  const hasMeaningfulModeNames = modeNames.some(name => !name.startsWith('Mode '));
  
  if (hasMultipleModes || hasMeaningfulModeNames) {
    result.values = convertedValues;
  }
  
  // Only include description if it exists and isn't empty
  if (variable.description && variable.description.trim()) {
    result.description = variable.description.trim();
  }
  
  return result;
}

// Utility functions
function generateToken(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function rgbToHex(rgb) {
  // Validate input
  if (!rgb || typeof rgb !== 'object') {
    return null;
  }

  const toHex = (c) => {
    // Ensure c is a valid number between 0 and 1
    const normalizedValue = Math.max(0, Math.min(1, c || 0));
    const intValue = Math.round(normalizedValue * 255);
    
    // Check for NaN or invalid values
    if (isNaN(intValue) || intValue < 0 || intValue > 255) {
      return '00';
    }
    
    const hex = intValue.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  const hexR = toHex(rgb.r);
  const hexG = toHex(rgb.g);
  const hexB = toHex(rgb.b);

  // Final validation - if any component is invalid, return null
  if (hexR === '00' && hexG === '00' && hexB === '00' && 
      (rgb.r === undefined || rgb.g === undefined || rgb.b === undefined)) {
    return null;
  }

  return '#' + hexR + hexG + hexB;
}

function generateSolidColorCSS(paint) {
  const { r, g, b } = paint.color;
  const opacity = paint.opacity !== undefined ? 
    Math.round(paint.opacity * 100) / 100 : 1; // Round to 2 decimal places
  
  if (opacity < 1) {
    const rgba = figmaRgbaToStandardRgba(paint.color);
    return `rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, ${opacity})`;
  }
  
  const hex = rgbToHex(paint.color);
  return hex || 'transparent';
}

function generateGradientCSS(paint) {
  if (!paint.gradientStops) return 'transparent';
  
  const stops = paint.gradientStops.map(stop => {
    const opacity = stop.color.a !== undefined ? 
      Math.round(stop.color.a * 100) / 100 : 1; // Round to 2 decimal places
    
    let colorValue;
    if (opacity < 1) {
      const rgba = figmaRgbaToStandardRgba(stop.color);
      colorValue = `rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, ${opacity})`;
    } else {
      const hex = rgbToHex(stop.color);
      colorValue = hex || 'transparent';
    }
    return `${colorValue} ${Math.round(stop.position * 100)}%`;
  }).join(', ');

  switch (paint.type) {
    case 'GRADIENT_LINEAR':
      // Calculate angle from gradient transform
      const angle = paint.gradientTransform ? 
        Math.atan2(paint.gradientTransform[0][1], paint.gradientTransform[0][0]) * 180 / Math.PI : 0;
      return `linear-gradient(${Math.round(angle)}deg, ${stops})`;
      
    case 'GRADIENT_RADIAL':
      return `radial-gradient(circle, ${stops})`;
      
    case 'GRADIENT_ANGULAR':
      return `conic-gradient(${stops})`;
      
    default:
      return `linear-gradient(${stops})`;
  }
}

function generateTextStyleCSS(style) {
  const cssProps = [];
  
  if (style.fontName && style.fontName.family) {
    cssProps.push(`font-family: "${style.fontName.family}"`);
  }
  
  if (style.fontName && style.fontName.style) {
    // Convert Figma font style to CSS
    const weight = parseFontWeight(style.fontName.style);
    if (weight) cssProps.push(`font-weight: ${weight}`);
    
    if (style.fontName.style.toLowerCase().includes('italic')) {
      cssProps.push('font-style: italic');
    }
  }
  
  if (style.fontSize) {
    cssProps.push(`font-size: ${style.fontSize}px`);
  }
  
  if (style.lineHeight && typeof style.lineHeight === 'object') {
    if (style.lineHeight.unit === 'PIXELS') {
      cssProps.push(`line-height: ${style.lineHeight.value}px`);
    } else if (style.lineHeight.unit === 'PERCENT') {
      cssProps.push(`line-height: ${style.lineHeight.value}%`);
    }
  }
  
  if (style.letterSpacing && typeof style.letterSpacing === 'object') {
    if (style.letterSpacing.unit === 'PIXELS') {
      cssProps.push(`letter-spacing: ${style.letterSpacing.value}px`);
    } else if (style.letterSpacing.unit === 'PERCENT') {
      cssProps.push(`letter-spacing: ${style.letterSpacing.value}%`);
    }
  }
  
  if (style.textCase && style.textCase !== 'ORIGINAL') {
    const textTransform = style.textCase.toLowerCase().replace('_', '-');
    cssProps.push(`text-transform: ${textTransform}`);
  }
  
  if (style.textDecoration && style.textDecoration !== 'NONE') {
    const decoration = style.textDecoration.toLowerCase().replace('_', '-');
    cssProps.push(`text-decoration: ${decoration}`);
  }
  
  return cssProps.join('; ');
}

function parseFontWeight(fontStyle) {
  const style = fontStyle.toLowerCase();
  const weightMap = {
    'thin': '100',
    'extralight': '200',
    'light': '300',
    'regular': '400',
    'normal': '400',
    'medium': '500',
    'semibold': '600',
    'bold': '700',
    'extrabold': '800',
    'black': '900'
  };
  
  for (const [key, value] of Object.entries(weightMap)) {
    if (style.includes(key)) {
      return value;
    }
  }
  
  // Check for numeric weights
  const numericMatch = style.match(/(\d{3})/);
  if (numericMatch) {
    return numericMatch[1];
  }
  
  return '400'; // default
}

function generateEffectCSS(effects) {
  if (!effects || effects.length === 0) return '';
  
  const shadows = [];
  
  effects.forEach(effect => {
    switch (effect.type) {
      case 'DROP_SHADOW':
      case 'INNER_SHADOW':
        // Skip effects without valid colors
        if (!effect.color) return;
        
        const inset = effect.type === 'INNER_SHADOW' ? 'inset ' : '';
        const opacity = (effect.color && effect.color.a !== undefined) ? 
          Math.round(effect.color.a * 100) / 100 : 1; // Round to 2 decimal places
        
        let colorValue;
        if (opacity < 1) {
          const rgba = figmaRgbaToStandardRgba(effect.color);
          colorValue = `rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, ${opacity})`;
        } else {
          const hex = rgbToHex(effect.color);
          if (!hex) return; // Skip effects with invalid colors
          colorValue = hex;
        }
        
        shadows.push(`${inset}${(effect.offset && effect.offset.x) || 0}px ${(effect.offset && effect.offset.y) || 0}px ${effect.radius || 0}px ${effect.spread || 0}px ${colorValue}`);
        break;
    }
  });
  
  return shadows.length > 0 ? `box-shadow: ${shadows.join(', ')}` : '';
}



function generateVariableCSS(variable, collection) {
  const token = `--${generateToken(variable.name)}`;
  
  // Get the default mode value
  const defaultModeId = (collection && collection.defaultModeId) || Object.keys(variable.valuesByMode)[0];
  const value = variable.valuesByMode[defaultModeId];
  
  if (variable.resolvedType === 'COLOR' && value) {
    // Check if value is already converted (has integer RGB values) or needs conversion
    const rgbValue = (typeof value.r === 'number' && value.r <= 1) ? 
      figmaRgbaToStandardRgba(value) : value;
    
    const hex = rgbToHex({ r: rgbValue.r / 255, g: rgbValue.g / 255, b: rgbValue.b / 255 });
    return `${token}: ${hex};`;
  } else if (variable.resolvedType === 'FLOAT' && value !== undefined) {
    return `${token}: ${value}px;`;
  } else if (variable.resolvedType === 'STRING' && value) {
    return `${token}: "${value}";`;
  } else if (variable.resolvedType === 'BOOLEAN' && value !== undefined) {
    return `${token}: ${value};`;
  }
  
  return `${token}: /* ${variable.resolvedType} */;`;
}