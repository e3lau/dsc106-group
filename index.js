import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";


// DATA EXTRACTION
const fs = require('fs');
const path = require('path');
const csvParser = require('csv-parser');

const readCSV = (filePath) => {
    return new Promise((resolve, reject) => {
        const results = [];
        fs.createReadStream(filePath)
            .pipe(csvParser())
            .on('data', (data) => results.push(data))
            .on('end', () => resolve(results))
            .on('error', (err) => reject(err));
    });
};

const demographicsPath = path.join(__dirname, 'data', 'Demographics.csv');
readCSV(demographicsPath).then(data => console.log(data.slice(0, 5)));

const dexcoms = {};
const loadDexcomData = async () => {
    for (let i = 1; i <= 16; i++) {
        if (i === 3) continue;
        let id = i.toString().padStart(3, '0');
        let filePath = path.join(__dirname, 'data', 'dexcom', `Dexcom_${id}.csv`);
        let data = await readCSV(filePath);
        data = data.slice(12).map(row => {
            delete row['Index'];
            row['Timestamp (YYYY-MM-DDThh:mm:ss)'] = new Date(row['Timestamp (YYYY-MM-DDThh:mm:ss)']);
            row['date'] = row['Timestamp (YYYY-MM-DDThh:mm:ss)'].toISOString().split('T')[0];
            return row;
        });
        dexcoms[`id_${id}`] = data;
    }
};

const foodLogs = {};
const loadFoodLogData = async () => {
    for (let i = 1; i <= 16; i++) {
        if (i === 3) continue;
        let id = i.toString().padStart(3, '0');
        let filePath = path.join(__dirname, 'data', 'food_log', `Food_Log_${id}.csv`);
        let data = await readCSV(filePath);
        data = data.map(row => {
            return {
                date: new Date(row['date']),
                time_of_day: row['time_of_day'] ? new Date(`1970-01-01T${row['time_of_day']}`) : null,
                time_begin: new Date(row['time_begin']),
                time_end: row['time_end'],
                logged_food: row['logged_food'],
                amount: row['amount'],
                unit: row['unit'],
                searched_food: row['searched_food'],
                calorie: row['calorie'],
                total_carb: row['total_carb'],
                dietary_fiber: row['dietary_fiber'],
                sugar: row['sugar'],
                protein: row['protein'],
                total_fat: row['total_fat']
            };
        });
        foodLogs[`id_${id}`] = data;
    }
};

(async () => {
    await loadDexcomData();
    console.log(dexcoms['id_001'].slice(0, 5));
    await loadFoodLogData();
    console.log(foodLogs['id_001'].slice(0, 5));
})();
