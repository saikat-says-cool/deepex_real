
const apiKey = 'ak_2ng06s0Ob2O98VQ5Xr8dC7c03VI91';
const baseUrl = 'https://api.longcat.chat/openai/v1';

async function testVisionPayload(modelName) {
    console.log(`\n--- Testing Vision Payload on ${modelName} ---`);
    try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: modelName,
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: 'What is in this image?' },
                            {
                                type: 'image_url',
                                image_url: {
                                    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-nature-boardwalk.jpg/2560px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg'
                                }
                            }
                        ]
                    }
                ],
                max_tokens: 100
            })
        });

        if (!response.ok) {
            const error = await response.text();
            console.log(`Result: FAILED (${response.status})`);
            console.log(`Error: ${error}`);
            return;
        }

        const data = await response.json();
        console.log(`Result: SUCCESS`);
        console.log(`Response: ${data.choices[0].message.content}`);
    } catch (err) {
        console.log(`Result: ERROR`);
        console.log(err.message);
    }
}

async function runTests() {
    await testVisionPayload('LongCat-Flash-Chat');
    await testVisionPayload('LongCat-Flash-Thinking-2601');
}

runTests();
