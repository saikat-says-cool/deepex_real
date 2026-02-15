
const keys = [
    { email: 'saikat@artificialyze.com', key: 'AIzaSyDPMOKNPhJ8BoY0EEbvPzAMXqeJlodlBF8' },
    { email: 'artificialyze@gmail.com', key: 'AIzaSyA1cMfK6jshUiKIKGy8pbvtV8i6zRB20Ls' },
    { email: 'teamartificialyze@gmail.com', key: 'AIzaSyDpbSBNww2SDnVECrzSg9Wne_2QZoj1MSc' },
    { email: 'ceo.artificialyze@gmail.com', key: 'AIzaSyAGiyfiRtD_2LFtW1cl6TTLDtBJo1iSW6Q' },
    { email: 'saikatduttachowdhury896@gmail.com', key: 'AIzaSyBOyjqZMNiKqCcf1TLK7i7oElBW_V_I198' },
    { email: 'contactus.vitaflow@gmail.com', key: 'AIzaSyC7v13yvluSLKVQtq0Ezdb0QGUB5_yHxW0' }
];

async function testKey(keyObj) {
    console.log(`\n=================================================`);
    console.log(`Testing key for: ${keyObj.email}`);
    try {
        const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${keyObj.key}`;
        const response = await fetch(listUrl);

        if (!response.ok) {
            const err = await response.text();
            console.log(`Result: FAILED (${response.status})`);
            return false;
        }

        const data = await response.json();
        const modelIds = data.models.map(m => m.name.replace('models/', ''));

        const gemini3Models = modelIds.filter(m => m.includes('3.0') || m.includes('3.1'));
        console.log(`Gemini 3.x Models found: ${gemini3Models.join(', ') || 'NONE'}`);

        if (gemini3Models.length === 0) {
            console.log(`Other models: ${modelIds.slice(0, 10).join(', ')}...`);
        }

        const targetModel = gemini3Models[0] || modelIds.find(m => m.includes('2.0-flash')) || modelIds[0];
        console.log(`Targeting model for test: ${targetModel}`);

        const genUrl = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${keyObj.key}`;
        const genResponse = await fetch(genUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: 'Hello, what model are you?' }] }]
            })
        });

        if (genResponse.ok) {
            const genData = await genResponse.json();
            console.log(`Test Generation: SUCCESS`);
            console.log(`Response: ${genData.candidates[0].content.parts[0].text.substring(0, 100)}...`);
        } else {
            console.log(`Test Generation: FAILED (${genResponse.status})`);
        }

        return true;
    } catch (err) {
        console.log(`Result: ERROR - ${err.message}`);
        return false;
    }
}

async function run() {
    for (const keyObj of keys) {
        await testKey(keyObj);
    }
}

run();
