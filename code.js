// Show UI - Figma automatically loads ui.html when specified in manifest
figma.showUI(__html__, { 
  width: 480, 
  height: 600,
  themeColors: true
});

// Helper function to convert RGB to hex
function rgbToHex(r, g, b) {
  function toHex(n) {
    var hex = Math.round(n * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }
  return '#' + toHex(r) + toHex(g) + toHex(b);
}

// Helper function to convert RGBA to CSS format
function rgbaToCSS(r, g, b, a) {
  return 'rgba(' + Math.round(r * 255) + ', ' + Math.round(g * 255) + ', ' + Math.round(b * 255) + ', ' + a + ')';
}

// Helper function to convert style name to design token
function styleNameToToken(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s\-\_]/g, '')
    .replace(/\s+/g, '-')
    .replace(/_{2,}/g, '_')
    .replace(/-{2,}/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '');
}

// Extract color styles (updated to include gradients)
function extractColorStyles() {
  var colorStyles = figma.getLocalPaintStyles();
  var result = [];
  
  for (var i = 0; i < colorStyles.length; i++) {
    var style = colorStyles[i];
    var paint = style.paints[0];
    
    if (paint && paint.type === 'SOLID') {
      // Handle solid colors
      var color = paint.color;
      var r = color.r;
      var g = color.g;
      var b = color.b;
      var opacity = paint.opacity || 1;
      
      var styleData = {
        token: styleNameToToken(style.name),
        name: style.name,
        description: style.description,
        type: 'solid',
        hex: rgbToHex(r, g, b),
        rgba: rgbaToCSS(r, g, b, opacity),
        opacity: opacity
      };
      
      result.push(styleData);
    } else if (paint && (paint.type === 'GRADIENT_LINEAR' || paint.type === 'GRADIENT_RADIAL' || paint.type === 'GRADIENT_ANGULAR' || paint.type === 'GRADIENT_DIAMOND')) {
      // Handle gradients
      var gradientStops = [];
      for (var j = 0; j < paint.gradientStops.length; j++) {
        var stop = paint.gradientStops[j];
        gradientStops.push({
          position: stop.position,
          color: {
            hex: rgbToHex(stop.color.r, stop.color.g, stop.color.b),
            rgba: rgbaToCSS(stop.color.r, stop.color.g, stop.color.b, stop.color.a)
          }
        });
      }
      
      var gradientData = {
        token: styleNameToToken(style.name),
        name: style.name,
        description: style.description,
        type: paint.type.toLowerCase().replace('gradient_', ''),
        gradientStops: gradientStops,
        opacity: paint.opacity || 1
      };
      
      // Add CSS gradient string for easy use
      if (paint.type === 'GRADIENT_LINEAR') {
        var angle = Math.atan2(paint.gradientTransform[0][1], paint.gradientTransform[0][0]) * 180 / Math.PI;
        var cssStops = [];
        for (var k = 0; k < gradientStops.length; k++) {
          cssStops.push(gradientStops[k].color.rgba + ' ' + (gradientStops[k].position * 100) + '%');
        }
        gradientData.css = 'linear-gradient(' + Math.round(angle) + 'deg, ' + cssStops.join(', ') + ')';
      } else if (paint.type === 'GRADIENT_RADIAL') {
        var cssStops = [];
        for (var k = 0; k < gradientStops.length; k++) {
          cssStops.push(gradientStops[k].color.rgba + ' ' + (gradientStops[k].position * 100) + '%');
        }
        gradientData.css = 'radial-gradient(circle, ' + cssStops.join(', ') + ')';
      }
      
      result.push(gradientData);
    }
  }
  
  return result;
}

// Extract text styles
function extractTextStyles() {
  var textStyles = figma.getLocalTextStyles();
  var result = [];
  
  for (var i = 0; i < textStyles.length; i++) {
    var style = textStyles[i];
    var styleData = {
      token: styleNameToToken(style.name),
      name: style.name,
      description: style.description,
      fontFamily: style.fontName.family,
      fontStyle: style.fontName.style,
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing,
      textCase: style.textCase,
      textDecoration: style.textDecoration
    };
    result.push(styleData);
  }
  
  return result;
}

// Extract effect styles
function extractEffectStyles() {
  var effectStyles = figma.getLocalEffectStyles();
  var result = [];
  
  for (var i = 0; i < effectStyles.length; i++) {
    var style = effectStyles[i];
    var effects = [];
    
    for (var j = 0; j < style.effects.length; j++) {
      var effect = style.effects[j];
      var effectData = {
        type: effect.type,
        visible: effect.visible,
        radius: effect.radius,
        color: effect.color ? rgbaToCSS(effect.color.r, effect.color.g, effect.color.b, effect.color.a) : null,
        offset: effect.offset,
        spread: effect.spread,
        blendMode: effect.blendMode
      };
      effects.push(effectData);
    }
    
    var styleData = {
      token: styleNameToToken(style.name),
      name: style.name,
      description: style.description,
      effects: effects
    };
    
    result.push(styleData);
  }
  
  return result;
}

// Extract grid styles
function extractGridStyles() {
  var gridStyles = figma.getLocalGridStyles();
  var result = [];
  
  for (var i = 0; i < gridStyles.length; i++) {
    var style = gridStyles[i];
    var styleData = {
      token: styleNameToToken(style.name),
      name: style.name,
      description: style.description,
      grids: style.grids
    };
    result.push(styleData);
  }
  
  return result;
}

// Extract variables
function extractVariables() {
  var variables = figma.variables.getLocalVariables();
  var collections = figma.variables.getLocalVariableCollections();
  
  var categorized = {
    colors: [],
    numbers: [],
    strings: [],
    booleans: []
  };

  for (var i = 0; i < variables.length; i++) {
    var variable = variables[i];
    var collection = null;
    
    for (var j = 0; j < collections.length; j++) {
      if (collections[j].id === variable.variableCollectionId) {
        collection = collections[j];
        break;
      }
    }
    
    var baseData = {
      name: variable.name,
      description: variable.description,
      collection: collection ? collection.name : 'Unknown',
      scopes: variable.scopes,
      hiddenFromPublishing: variable.hiddenFromPublishing
    };

    var values = {};
    var valueKeys = Object.keys(variable.valuesByMode);
    
    for (var k = 0; k < valueKeys.length; k++) {
      var modeId = valueKeys[k];
      var value = variable.valuesByMode[modeId];
      var mode = null;
      var modeName = 'Default';
      
      if (collection && collection.modes) {
        for (var m = 0; m < collection.modes.length; m++) {
          if (collection.modes[m].modeId === modeId) {
            mode = collection.modes[m];
            modeName = mode.name;
            break;
          }
        }
      }
      
      if (variable.resolvedType === 'COLOR' && typeof value === 'object' && value !== null && 'r' in value) {
        values[modeName] = {
          hex: rgbToHex(value.r, value.g, value.b),
          rgba: rgbaToCSS(value.r, value.g, value.b, value.a)
        };
      } else {
        values[modeName] = value;
      }
    }

    var variableData = {
      token: styleNameToToken(variable.name),
      name: baseData.name,
      description: baseData.description,
      collection: baseData.collection,
      scopes: baseData.scopes,
      hiddenFromPublishing: baseData.hiddenFromPublishing,
      values: values
    };

    switch (variable.resolvedType) {
      case 'COLOR':
        categorized.colors.push(variableData);
        break;
      case 'FLOAT':
        categorized.numbers.push(variableData);
        break;
      case 'STRING':
        categorized.strings.push(variableData);
        break;
      case 'BOOLEAN':
        categorized.booleans.push(variableData);
        break;
    }
  }

  return categorized;
}

// Main export function
function exportData() {
  try {
    var styles = {
      colors: extractColorStyles(),
      textStyles: extractTextStyles(),
      effects: extractEffectStyles(),
      grids: extractGridStyles()
    };

    var variables = extractVariables();

    var exportDataObj = {
      styles: styles,
      variables: variables,
      metadata: {
        fileName: figma.root.name,
        exportDate: new Date().toISOString(),
        totalStyles: styles.colors.length + styles.textStyles.length + styles.effects.length + styles.grids.length,
        totalVariables: variables.colors.length + variables.numbers.length + variables.strings.length + variables.booleans.length
      }
    };

    figma.ui.postMessage({ 
      type: 'export-complete', 
      data: exportDataObj 
    });

  } catch (error) {
    figma.ui.postMessage({ 
      type: 'export-error', 
      message: error.message 
    });
  }
}

// Handle messages from UI
figma.ui.onmessage = function(msg) {
  switch (msg.type) {
    case 'export-data':
      exportData();
      break;
    case 'close-plugin':
      figma.closePlugin();
      break;
  }
};