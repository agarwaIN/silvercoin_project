const { Jimp, rgbaToInt, intToRGBA } = require('jimp');
const fs = require('fs');

async function processLogo() {
  try {
    const inputPath = './assets/loanApp.png';
    const image = await Jimp.read(inputPath);
    
    // Sample top-left pixel for background color
    const bgColorInt = image.getPixelColor(10, 10);
    const bgColorRgba = intToRGBA(bgColorInt);
    console.log(`Background color: rgba(${bgColorRgba.r}, ${bgColorRgba.g}, ${bgColorRgba.b}, ${bgColorRgba.a})`);
    
    // The original is 723x851. Let's crop tighter to remove all text.
    // Let's assume the emblem takes up the top 450 pixels.
    const cropWidth = image.bitmap.width;
    const cropHeight = 450; 
    image.crop({ x: 0, y: 0, w: cropWidth, h: cropHeight });
    
    // Create a 1024x1024 canvas with the SAME background color to make it seamless
    const canvasSize = 1024;
    const background = new Jimp({ width: canvasSize, height: canvasSize, color: bgColorInt });
    
    // Scale the cropped emblem to about 65% of the canvas
    const targetSize = Math.floor(canvasSize * 0.65);
    // scaleToFit might leave transparent edges if aspect ratio differs, but since the background matches, it's fine!
    image.scaleToFit({ w: targetSize, h: targetSize });
    
    // Composite
    const x = Math.floor((canvasSize - image.bitmap.width) / 2);
    const y = Math.floor((canvasSize - image.bitmap.height) / 2);
    
    background.composite(image, x, y);
    
    // Save to all app icon variations
    await background.write('./assets/icon.png');
    await background.write('./assets/adaptive-icon.png');
    await background.write('./assets/splash.png');
    await background.write('./assets/favicon.png');
    
    console.log("Images seamlessly padded and saved successfully!");
  } catch (error) {
    console.error("Error processing image:", error);
  }
}

processLogo();
