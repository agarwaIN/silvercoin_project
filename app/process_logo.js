const { Jimp } = require('jimp');

async function processLogo() {
  try {
    const inputPath = './assets/loanApp.png';
    console.log("Reading image...");
    
    // Read the user-provided logo
    const image = await Jimp.read(inputPath);
    console.log(`Original Size: ${image.bitmap.width}x${image.bitmap.height}`);
    
    // Crop the top part to remove the text at the bottom.
    // The original is 723x851. The emblem looks to be in the top 550 pixels.
    // We crop (x=0, y=0, w=723, h=550)
    image.crop({ x: 0, y: 0, w: image.bitmap.width, h: Math.floor(image.bitmap.height * 0.65) });
    
    // Create a square canvas matching the max dimension or 1024
    const canvasSize = 1024;
    // Scale image down so it takes about 60-70% of the canvas, ensuring it fits perfectly inside adaptive icon masks
    const targetSize = Math.floor(canvasSize * 0.65);
    
    image.scaleToFit({ w: targetSize, h: targetSize });
    
    // Create new transparent canvas
    const background = new Jimp({ width: canvasSize, height: canvasSize, color: 0x00000000 });
    
    // Composite
    const x = Math.floor((canvasSize - image.bitmap.width) / 2);
    const y = Math.floor((canvasSize - image.bitmap.height) / 2);
    
    background.composite(image, x, y);
    
    // Save to all app icon variations
    await background.write('./assets/icon.png');
    await background.write('./assets/adaptive-icon.png');
    await background.write('./assets/splash.png');
    await background.write('./assets/favicon.png');
    
    console.log("Images cropped (text removed), padded, and saved successfully!");
  } catch (error) {
    console.error("Error processing image:", error);
  }
}

processLogo();
