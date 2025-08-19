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
    variables: {
      colors: [],
      numbers: [],
      strings: [],
      booleans: []
    },
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

    // Create collection lookup map for variable processing
    const collectionMap = new Map();
    collections.forEach(collection => {
      collectionMap.set(collection.id, collection);
    });

    // Process variables
    for (const variable of variables) {
      try {
        const varData = await processVariable(variable, collectionMap);
        if (varData) {
          switch (varData.resolvedType) {
            case 'COLOR':
              data.variables.colors.push(varData);
              break;
            case 'FLOAT':
              data.variables.numbers.push(varData);
              break;
            case 'STRING':
              data.variables.strings.push(varData);
              break;
            case 'BOOLEAN':
              data.variables.booleans.push(varData);
              break;
          }
        }
      } catch (error) {
        console.warn(`Failed to process variable ${variable.name}:`, error);
      }
    }

    // Add collection metadata
    data.metadata.collections = collections.map(collection => ({
      id: collection.id,
      name: collection.name,
      modes: collection.modes,
      variableIds: collection.variableIds
    }));

  } catch (error) {
    console.error('Error during export process:', error);
    throw new Error('Failed to export styles and variables. Please ensure the file has loaded completely and try again.');
  }

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
  return {
    r: Math.round(figmaColor.r * 255),
    g: Math.round(figmaColor.g * 255),
    b: Math.round(figmaColor.b * 255),
    a: figmaColor.a !== undefined ? figmaColor.a : 1
  };
}

async function processColorStyle(style) {
  if (!style.paints || style.paints.length === 0) {
    return null;
  }

  const paint = style.paints[0];
  const result = {
    name: style.name,
    description: style.description || '',
    token: generateToken(style.name),
    type: paint.type.toLowerCase()
  };

  switch (paint.type) {
    case 'SOLID':
      result.hex = rgbToHex(paint.color);
      result.rgb = figmaRgbToStandardRgb(paint.color); // Convert to 0-255 range
      result.opacity = paint.opacity !== undefined ? paint.opacity : 1;
      result.css = generateSolidColorCSS(paint);
      break;
      
    case 'GRADIENT_LINEAR':
    case 'GRADIENT_RADIAL':
    case 'GRADIENT_ANGULAR':
    case 'GRADIENT_DIAMOND':
      result.gradient = {
        type: paint.type,
        gradientStops: paint.gradientStops.map(stop => ({
          color: figmaRgbaToStandardRgba(stop.color), // Convert gradient stop colors
          position: stop.position
        })),
        gradientTransform: paint.gradientTransform
      };
      result.css = generateGradientCSS(paint);
      break;
      
    case 'IMAGE':
      result.imageRef = paint.imageRef || null;
      result.scaleMode = paint.scaleMode || 'FILL';
      result.css = 'url(...)'; // Image handling would need additional implementation
      break;
      
    default:
      result.css = 'transparent';
  }

  return result;
}

async function processTextStyle(style) {
  return {
    name: style.name,
    description: style.description || '',
    token: generateToken(style.name),
    fontFamily: style.fontName && style.fontName.family || null,
    fontWeight: style.fontName && style.fontName.style || null,
    fontSize: style.fontSize || null,
    lineHeight: style.lineHeight || null,
    letterSpacing: style.letterSpacing || null,
    paragraphSpacing: style.paragraphSpacing || null,
    textCase: style.textCase || 'ORIGINAL',
    textDecoration: style.textDecoration || 'NONE',
    css: generateTextStyleCSS(style)
  };
}

async function processEffectStyle(style) {
  return {
    name: style.name,
    description: style.description || '',
    token: generateToken(style.name),
    effects: style.effects || [],
    css: generateEffectCSS(style.effects || [])
  };
}

async function processGridStyle(style) {
  return {
    name: style.name,
    description: style.description || '',
    token: generateToken(style.name),
    layoutGrids: style.layoutGrids || [],
    css: generateGridCSS(style.layoutGrids || [])
  };
}

async function processVariable(variable, collectionMap) {
  const collection = collectionMap.get(variable.variableCollectionId);
  
  // Convert color variable values to standard RGB format
  const convertedValuesByMode = {};
  for (const [modeId, value] of Object.entries(variable.valuesByMode)) {
    if (variable.resolvedType === 'COLOR' && value && typeof value === 'object') {
      convertedValuesByMode[modeId] = figmaRgbaToStandardRgba(value);
    } else {
      convertedValuesByMode[modeId] = value;
    }
  }
  
  return {
    name: variable.name,
    description: variable.description || '',
    token: generateToken(variable.name),
    resolvedType: variable.resolvedType,
    scopes: variable.scopes || [],
    variableCollectionId: variable.variableCollectionId,
    collectionName: (collection && collection.name) || 'Unknown Collection',
    valuesByMode: convertedValuesByMode,
    css: generateVariableCSS(variable, collection)
  };
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
  const toHex = (c) => {
    const hex = Math.round(c * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return '#' + toHex(rgb.r) + toHex(rgb.g) + toHex(rgb.b);
}

function generateSolidColorCSS(paint) {
  const { r, g, b } = paint.color;
  const opacity = paint.opacity !== undefined ? paint.opacity : 1;
  
  if (opacity < 1) {
    return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${opacity})`;
  }
  
  return rgbToHex(paint.color);
}

function generateGradientCSS(paint) {
  if (!paint.gradientStops) return 'transparent';
  
  const stops = paint.gradientStops.map(stop => {
    const color = rgbToHex(stop.color);
    const opacity = stop.color.a !== undefined ? stop.color.a : 1;
    const colorValue = opacity < 1 ? 
      `rgba(${Math.round(stop.color.r * 255)}, ${Math.round(stop.color.g * 255)}, ${Math.round(stop.color.b * 255)}, ${opacity})` :
      color;
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
        const inset = effect.type === 'INNER_SHADOW' ? 'inset ' : '';
        const color = effect.color ? rgbToHex(effect.color) : '#000000';
        const opacity = (effect.color && effect.color.a !== undefined) ? effect.color.a : 1;
        const colorValue = opacity < 1 ? 
          `rgba(${Math.round(effect.color.r * 255)}, ${Math.round(effect.color.g * 255)}, ${Math.round(effect.color.b * 255)}, ${opacity})` :
          color;
        
        shadows.push(`${inset}${(effect.offset && effect.offset.x) || 0}px ${(effect.offset && effect.offset.y) || 0}px ${effect.radius || 0}px ${effect.spread || 0}px ${colorValue}`);
        break;
    }
  });
  
  return shadows.length > 0 ? `box-shadow: ${shadows.join(', ')}` : '';
}

function generateGridCSS(layoutGrids) {
  // Basic grid CSS generation - could be expanded based on needs
  return layoutGrids.map(grid => {
    switch (grid.pattern) {
      case 'COLUMNS':
        return `display: grid; grid-template-columns: repeat(${grid.count || 12}, 1fr); gap: ${grid.gutterSize || 20}px;`;
      case 'ROWS':
        return `display: grid; grid-template-rows: repeat(${grid.count || 12}, 1fr); gap: ${grid.gutterSize || 20}px;`;
      default:
        return 'display: grid;';
    }
  }).join(' ');
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