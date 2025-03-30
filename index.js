require('dotenv').config();
const twilio = require('twilio');
const XLSX = require('xlsx');
const fs = require('fs');
const sharp = require('sharp');
const path = require('path');

// Initialize Twilio client
const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);

// Excel file path
const EXCEL_FILE = 'numbers2.xlsx';
const IMAGE_FILE = "image.jpg";
const OUTPUT_DIR = "output";
const BASE_URL = "https://w.fouq.agency"; // تم تحديث الرابط ليكون السيرفر الخاص بك

// Create output directory if it doesn't exist
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR);
}

async function customizeImage(name, phoneNumber) {
    try {
        const outputPath = path.join(OUTPUT_DIR, `${phoneNumber}.png`);
        
        // Get the dimensions of the input image
        const metadata = await sharp(IMAGE_FILE).metadata();
        const { width, height } = metadata;

        // Create SVG text with background for better visibility
        const svgText = `
            <svg width="${width}" height="${height}">
                <defs>
                    <filter id="shadow">
                        <feDropShadow dx="2" dy="2" stdDeviation="2" flood-color="#000" flood-opacity="0.5"/>
                    </filter>
                </defs>
                <text 
                    x="50%" 
                    y="40%" 
                    font-family="Arial" 
                    font-size="72" 
                    fill="#0865aa" 
                    text-anchor="middle" 
                    dy=".3em"
                    filter="url(#shadow)"
                    font-weight="bold"
                >${name}</text>
            </svg>
        `;

        // Create a new image with the same dimensions as the input image
        await sharp(IMAGE_FILE)
            .composite([
                {
                    input: Buffer.from(svgText),
                    gravity: 'center',
                    top: 0,
                    left: 0
                }
            ])
            .png()
            .toFile(outputPath);

        return `${BASE_URL}/${phoneNumber}.png`;
    } catch (error) {
        console.error('Error in customizing image:', error);
        return null;
    }
}

async function sendWhatsAppMessage(to, name) {
    try {
        // Customize image with name
        const imageUrl = await customizeImage(name, to);
        if (!imageUrl) {
            throw new Error('Failed to customize image');
        }

        // Send image via Twilio
        await client.messages.create({
            contentSid: "HX57fae6f22af3fa4fbb5a720d32488322", // هنجيبها من Twilio لو بتحب تستخدم Content API
            contentVariables: JSON.stringify({
                name: name,
                byname: to
            }),
            from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
            to: `whatsapp:${to}`
        });

        console.log(`Image sent successfully to ${to}`);
        return true;
    } catch (error) {
        console.error(`Error in sending image to ${to}:`, error.message);
        return false;
    }
}

async function processNumbers() {
    try {
        // Read the Excel file
        const workbook = XLSX.readFile(EXCEL_FILE);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet);

        // Print the structure of the Excel file
        console.log('Excel file structure:', Object.keys(data[0] || {}));
        console.log('number of rows in the file:', data.length);

        // Load sent numbers from progress file
        let sentNumbers = new Set();
        if (fs.existsSync('sent_numbers.json')) {
            sentNumbers = new Set(JSON.parse(fs.readFileSync('sent_numbers.json')));
            console.log('done', sentNumbers.size, 'numbers sent previously');
        }

        // Process each row
        for (const row of data) {
            // Get all columns from the row
            const columns = Object.keys(row);
            console.log('row', row);

            // Try to find a phone number column and name column
            let phoneNumber = null;
            let name = null;
            
            for (const column of columns) {
                const value = row[column];
                if (typeof value === 'string') {
                    if (value.match(/^\+?[0-9]+$/)) {
                        phoneNumber = value;
                    } else if (!value.match(/^\+?[0-9]+$/)) {
                        name = value;
                    }
                }
            }

            if (!phoneNumber) {
                console.log('no phone number in this row:', row);
                continue;
            }

            // Remove any non-numeric characters except +
            phoneNumber = phoneNumber.replace(/[^\d+]/g, '');
            
            if (!sentNumbers.has(phoneNumber)) {
                console.log('sending image to:', phoneNumber);
                const success = await sendWhatsAppMessage(phoneNumber, name || 'عزيزي');
                
                if (success) {
                    sentNumbers.add(phoneNumber);
                    // Save progress after each successful send
                    fs.writeFileSync('sent_numbers.json', JSON.stringify([...sentNumbers]));
                    console.log('progress saved');
                }
                
                // Add a delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 1000));
            } else {
                console.log('image already sent to:', phoneNumber);
            }
        }

        console.log('all numbers processed successfully!');
    } catch (error) {
        console.error('error in processing numbers:', error);
    }
}

// Run the script
processNumbers(); 