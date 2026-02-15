
const key = 'AIzaSyA1cMfK6jshUiKIKGy8pbvtV8i6zRB20Ls'; // artificialyze@gmail.com
const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;

async function listAll() {
    const response = await fetch(url);
    const data = await response.json();
    console.log(JSON.stringify(data.models.map(m => m.name.replace('models/', '')), null, 2));
}

listAll();
