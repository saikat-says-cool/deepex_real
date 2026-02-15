
const key = 'AIzaSyA1cMfK6jshUiKIKGy8pbvtV8i6zRB20Ls';
const baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';

async function testModel(modelName) {
    console.log(`\n--- Testing Model: ${modelName} ---`);
    const url = `${baseUrl}/${modelName}:generateContent?key=${key}`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: 'Who are you and what are your capabilities?' }] }]
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
    await testModel('gemini-3-pro-preview');
    await testModel('nano-banana-pro-preview');
}

run();
