import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

async function loadCSV(filePath) {
    return await d3.csv(filePath);
}

// Corrupted Data Skip
const skipIDs = [3, 7, 13, 15, 16];

export const dexcoms = {};
export const foodLogs = {};
export const formatDate = d3.timeFormat("%Y-%m-%d");
export const formatHour = d3.timeFormat("%H");

const demographics = await loadCSV("../data/Demographics.csv");
console.log("Demographics head:", demographics.slice(0, 5));

// Load Dexcom data
for (let i = 1; i <= 16; i++) {
    if (skipIDs.includes(i)) continue;
    const id = i.toString().padStart(3, "0");
    let data = await loadCSV(`../data/dexcom/Dexcom_${id}.csv`);
    data = data.slice(12);
    data.forEach(row => {
        delete row["Index"];
        let parsedDateTime = Date.parse(row["Timestamp (YYYY-MM-DDThh:mm:ss)"]);
        row["Timestamp (YYYY-MM-DDThh:mm:ss)"] = new Date(parsedDateTime);
        row["Glucose Value (mg/dL)"] = +row["Glucose Value (mg/dL)"];
    });
    dexcoms[`id_${id}`] = data;
}
console.log("Dexcom id_001 head:", dexcoms["id_001"].slice(0, 5));

// Load Food Logs
for (let i = 1; i <= 16; i++) {
    if (skipIDs.includes(i)) continue;
    const id = i.toString().padStart(3, "0");
    let data = await loadCSV(`../data/food_log/Food_Log_${id}.csv`);

    const newKeys = ["date", "time_of_day", "time_begin", "time_end",
        "logged_food", "amount", "unit", "searched_food",
        "calorie", "total_carb", "dietary_fiber", "sugar",
        "protein", "total_fat"];
    data = data.map(row => {
        const oldValues = Object.values(row);
        const newRow = {};
        newKeys.forEach((key, index) => {
            newRow[key] = oldValues[index];
        });
        let parsedTimeBegin = Date.parse(newRow.time_begin);
        newRow.time_begin = isNaN(parsedTimeBegin) ? null : new Date(parsedTimeBegin);
        return newRow;
    });
    foodLogs[`id_${id}`] = data;
}

// For each subject’s food logs, group by day and create a flag
// hasStandardBreakfast if any entry on that day uses a standard breakfast option.
const breakfastOptions = ["standard breakfast", "std breakfast", "frosted flakes", "corn flakes",
    "cornflakes", "frosted flake", "std bfast"];

for (let id in foodLogs) {
    const groups = d3.group(foodLogs[id], d => formatDate(d.time_begin));
    groups.forEach((rows, day) => {
        const hasBreakfast = rows.some(d =>
            breakfastOptions.includes(d.logged_food.toLowerCase())
        );
        rows.forEach(d => d.hasStandardBreakfast = hasBreakfast);
    });
}

console.log("Food Log id_001 head:", foodLogs["id_001"].slice(0, 50));