
const key = 'AIzaSyA1cMfK6jshUiKIKGy8pbvtV8i6zRB20Ls';
const baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';

async function testVision(modelName) {
    console.log(`\n--- Testing Image Understanding: ${modelName} ---`);
    const url = `${baseUrl}/${modelName}:generateContent?key=${key}`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: 'Describe what you see in this image.' },
                        {
                            inline_data: {
                                mime_type: 'image/jpeg',
                                data: await fetch('https://picsum.photos/400/300')
                                    .then(res => res.arrayBuffer())
                                    .then(buffer => Buffer.from(buffer).toString('base64'))
                            }
                        }
                    ]
                }]
            })
        });

        if (!response.ok) {
            const err = await response.text();
            console.log(`Result: FAILED (${response.status})`);
            console.log(`Error: ${err}`);
            return;
        }

        const data = await response.json();
        console.log(`Result: SUCCESS`);
        console.log(`Response: ${data.candidates[0].content.parts[0].text}`);
    } catch (err) {
        console.log(`Result: ERROR - ${err.message}`);
    }
}

async function run() {
    await testVision('gemini-2.0-flash'); // Control
    await testVision('gemini-3-pro-image-preview'); // Targeted
}

run();
