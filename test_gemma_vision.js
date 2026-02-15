
const accountId = 'eeb265534976cd0d6eee0e216c6a875f';
const apiKey = 'd5gUBoUFZwBvxI-vjIe2Dr5gPgi_1ltCJDsOj6ix';
const BASE = 'https://api.cloudflare.com/client/v4/accounts';

async function testGemma3WithImage() {
    console.log('--- Testing Gemma 3 with real image input ---');

    // Fetch a small test image and convert to base64
    const imgRes = await fetch('https://picsum.photos/400/300');
    const imgBuffer = await imgRes.arrayBuffer();
    const base64 = Buffer.from(imgBuffer).toString('base64');
    console.log(`Image fetched: ${imgBuffer.byteLength} bytes`);

    const url = `${BASE}/${accountId}/ai/run/@cf/google/gemma-3-12b-it`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: 'Describe this image in detail. What do you see?' },
                        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } }
                    ]
                }
            ],
            max_tokens: 300
        })
    });

    if (!res.ok) {
        const err = await res.text();
        console.log(`FAILED (${res.status}): ${err}`);
        return;
    }

    const data = await res.json();
    console.log(`SUCCESS!`);
    console.log(`Response: ${data.result?.response || JSON.stringify(data.result)}`);
}

testGemma3WithImage();
