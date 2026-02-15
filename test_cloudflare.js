
const accounts = [
    { email: 'saikat@artificialyze.com', accountId: 'eeb265534976cd0d6eee0e216c6a875f', apiKey: 'd5gUBoUFZwBvxI-vjIe2Dr5gPgi_1ltCJDsOj6ix' },
    { email: 'saikatduttachowdhury896@gmail.com', accountId: '2a8ae7aecd85dbbd28840005dd76c884', apiKey: 'z0bjZmHkmmZ_lWJGz_uzBSEt8Nxy8BwM42Zzu0vL' },
    { email: 'saikatduttachowdhury897@gmail.com', accountId: '87c8ce4bbc388c76d7912d00c3cb261a', apiKey: '3lWkzteUoLl16UHXrQ4TWJpBLlsecKMCkUGSXLOw' },
    { email: 'saikat@thynknext.in', accountId: '215f610bb918d74131350e557d5f25ca', apiKey: 'uJFJZ-KY6DsSCp1XWRbwGKQoquKrZSTVp3Vv7BzZ' },
];

const BASE = 'https://api.cloudflare.com/client/v4/accounts';

async function testVision(acc) {
    console.log(`\n=== Testing VISION on ${acc.email} ===`);
    const url = `${BASE}/${acc.accountId}/ai/run/@cf/meta/llama-3.2-11b-vision-instruct`;
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${acc.apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [
                    { role: 'user', content: 'Say "DeepEx Vision Online" if you can read this.' }
                ]
            })
        });
        if (!res.ok) {
            const err = await res.text();
            console.log(`  VISION: FAILED (${res.status}) - ${err.substring(0, 200)}`);
            return false;
        }
        const data = await res.json();
        console.log(`  VISION: SUCCESS`);
        console.log(`  Response: ${data.result?.response?.substring(0, 150) || JSON.stringify(data.result).substring(0, 150)}`);
        return true;
    } catch (err) {
        console.log(`  VISION: ERROR - ${err.message}`);
        return false;
    }
}

async function testImageGen(acc) {
    console.log(`\n=== Testing IMAGE GEN on ${acc.email} ===`);
    const url = `${BASE}/${acc.accountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`;
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${acc.apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: 'A glowing blue neural network brain on a dark background',
                num_steps: 4
            })
        });
        if (!res.ok) {
            const err = await res.text();
            console.log(`  IMG GEN: FAILED (${res.status}) - ${err.substring(0, 200)}`);
            return false;
        }
        // Flux returns binary image data
        const contentType = res.headers.get('content-type');
        console.log(`  IMG GEN: SUCCESS (content-type: ${contentType})`);
        const buffer = await res.arrayBuffer();
        console.log(`  Image size: ${buffer.byteLength} bytes`);
        return true;
    } catch (err) {
        console.log(`  IMG GEN: ERROR - ${err.message}`);
        return false;
    }
}

async function testGemma3Vision(acc) {
    console.log(`\n=== Testing GEMMA 3 VISION on ${acc.email} ===`);
    const url = `${BASE}/${acc.accountId}/ai/run/@cf/google/gemma-3-12b-it`;
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${acc.apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [
                    { role: 'user', content: 'Say "DeepEx Gemma Online" if you can read this.' }
                ]
            })
        });
        if (!res.ok) {
            const err = await res.text();
            console.log(`  GEMMA3: FAILED (${res.status}) - ${err.substring(0, 200)}`);
            return false;
        }
        const data = await res.json();
        console.log(`  GEMMA3: SUCCESS`);
        console.log(`  Response: ${data.result?.response?.substring(0, 150) || JSON.stringify(data.result).substring(0, 150)}`);
        return true;
    } catch (err) {
        console.log(`  GEMMA3: ERROR - ${err.message}`);
        return false;
    }
}

async function run() {
    const results = [];
    for (const acc of accounts) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`ACCOUNT: ${acc.email}`);
        console.log(`${'='.repeat(60)}`);
        const vision = await testVision(acc);
        const imgGen = await testImageGen(acc);
        const gemma3 = await testGemma3Vision(acc);
        results.push({ email: acc.email, vision, imgGen, gemma3 });
    }

    console.log(`\n\n${'='.repeat(60)}`);
    console.log('SUMMARY');
    console.log(`${'='.repeat(60)}`);
    for (const r of results) {
        console.log(`${r.email}: Vision=${r.vision ? 'YES' : 'NO'} | ImgGen=${r.imgGen ? 'YES' : 'NO'} | Gemma3=${r.gemma3 ? 'YES' : 'NO'}`);
    }
}

run();
