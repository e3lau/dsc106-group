import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

async function loadCSV(filePath) {
  return await d3.csv(filePath);
}

const dexcoms = {};
const foodLogs = {};

(async () => {
  const demographics = await loadCSV("data/Demographics.csv");
  console.log("Demographics head:", demographics.slice(0, 5));

  // Load Dexcom data
  for (let i = 1; i <= 16; i++) {
    if (i === 3) continue;
    const id = i.toString().padStart(3, "0");
    let data = await loadCSV(`data/dexcom/Dexcom_${id}.csv`);
    data = data.slice(12);
    data.forEach(row => {
      delete row["Index"];
      row["Timestamp (YYYY-MM-DDThh:mm:ss)"] = new Date(row["Timestamp (YYYY-MM-DDThh:mm:ss)"]);
      // Save the date string (YYYY-MM-DD) for later joining
      row.date = row["Timestamp (YYYY-MM-DDThh:mm:ss)"].toISOString().split("T")[0];
      row["Glucose Value (mg/dL)"] = +row["Glucose Value (mg/dL)"];
    });
    dexcoms[`id_${id}`] = data;
  }
  console.log("Dexcom id_001 head:", dexcoms["id_001"].slice(0, 5));

  // Load Food Logs
  for (let i = 1; i <= 16; i++) {
    if (i === 3) continue;
    const id = i.toString().padStart(3, "0");
    let data = await loadCSV(`data/food_log/Food_Log_${id}.csv`);
    
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

      // Use Date.parse() to handle inconsistent date formats
      let parsedDate = Date.parse(newRow.date);
      newRow.date = isNaN(parsedDate) ? new Date() : new Date(parsedDate);

      let parsedTimeBegin = Date.parse(newRow.time_begin);
      newRow.time_begin = isNaN(parsedTimeBegin) ? null : new Date(parsedTimeBegin);

      // For time_of_day, if available, assume it's a time string; otherwise fallback to time_begin.
      if (newRow.time_of_day) {
         newRow.time_of_day = new Date(`1970-01-01T${newRow.time_of_day}`);
      } else if (newRow.time_begin) {
         newRow.time_of_day = newRow.time_begin;
      } else {
         newRow.time_of_day = null;
      }
      
      return newRow;
    });
    foodLogs[`id_${id}`] = data;
  }
  
  // For each subject’s food logs, group by day and set a new boolean flag,
  // hasStandardBreakfast, to true if any entry on that day has "Standard Breakfast"
  for (let id in foodLogs) {
    const groups = d3.group(foodLogs[id], d => d.date.toISOString().split("T")[0]);
    groups.forEach((rows, day) => {
      const hasBreakfast = rows.some(d => d.logged_food === "Standard Breakfast");
      rows.forEach(d => d.hasStandardBreakfast = hasBreakfast);
    });
  }

  console.log("Food Log id_001 head:", foodLogs["id_001"].slice(0, 50));
  renderHistogram(dexcoms, foodLogs);
})();


////// Render Overlapping Histogram //////
function renderHistogram(dexcoms, foodLogs) {
  if (!dexcoms["id_001"] || dexcoms["id_001"].length === 0) {
    console.error("No data available for histogram.");
    return;
  }

  // Set up dimensions and margins
  const width = 1000;
  const height = 600;
  const margin = { top: 20, right: 20, bottom: 40, left: 50 };
  const usableArea = {
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
  };

  // Append SVG element and group for margins
  const svg = d3.select('#chart')
    .append('svg')
    .attr('width', width)
    .attr('height', height);
    
  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // For this example, we will work with subject "id_001".
  // Create a mapping from day (YYYY-MM-DD) to hasStandardBreakfast flag.
  const foodLogData = foodLogs["id_001"];
  const breakfastMap = {};
  foodLogData.forEach(d => {
    const day = d.date.toISOString().split("T")[0];
    breakfastMap[day] = breakfastMap[day] || d.hasStandardBreakfast;
  });

  // Initialize arrays to store sums and counts for each hour for each category.
  const standardSums = Array(24).fill(0);
  const standardCounts = Array(24).fill(0);
  const nonStandardSums = Array(24).fill(0);
  const nonStandardCounts = Array(24).fill(0);

  // Process each Dexcom reading from id_001.
  dexcoms["id_001"].forEach(d => {
    const readingDate = d["Timestamp (YYYY-MM-DDThh:mm:ss)"];
    const day = readingDate.toISOString().split("T")[0];
    const hour = readingDate.getHours();
    const glucose = +d["Glucose Value (mg/dL)"];
    if (!isNaN(glucose)) {
      if (breakfastMap[day]) {
        standardSums[hour] += glucose;
        standardCounts[hour] += 1;
      } else {
        nonStandardSums[hour] += glucose;
        nonStandardCounts[hour] += 1;
      }
    }
  });

  // Compute average glucose per hour for both groups.
  const histogramData = [];
  for (let h = 0; h < 24; h++) {
    histogramData.push({
      hour: h,
      standard: standardCounts[h] > 0 ? standardSums[h] / standardCounts[h] : 0,
      nonstandard: nonStandardCounts[h] > 0 ? nonStandardSums[h] / nonStandardCounts[h] : 0
    });
  }

  // Outer scale for hours (0-23)
  const x0 = d3.scaleBand()
    .domain(histogramData.map(d => d.hour))
    .range([0, usableArea.width])
    .padding(0.2);

  // Y-scale for the average glucose values.
  const maxAvg = d3.max(histogramData, d => Math.max(d.standard, d.nonstandard)) || 200;
  const y = d3.scaleLinear()
    .domain([0, maxAvg])
    .nice()
    .range([usableArea.height, 0]);

  // Define categories
  const categories = ["standard", "nonstandard"];

  // Create groups for each hour and append overlapping bars.
  const hourGroups = g.selectAll(".hourGroup")
    .data(histogramData)
    .enter()
    .append("g")
    .attr("class", "hourGroup")
    .attr("transform", d => `translate(${x0(d.hour)},0)`);

  // In each hour group, create an array for both category values.
  hourGroups.each(function(d) {
    // Create array of objects for both categories.
    const dataArray = categories.map(cat => ({ category: cat, value: d[cat] }));
    // Sort descending so that the taller bar is drawn first (at the back).
    dataArray.sort((a, b) => b.value - a.value);
    
    // Check if both categories have nonzero values.
    const bothPresent = dataArray.every(obj => obj.value > 0);
    
    // Append the bars; use the original color for the taller bar.
    // For the top (shorter) bar, if both are present (i.e., overlapping), use grey.
    d3.select(this).selectAll("rect")
      .data(dataArray)
      .enter()
      .append("rect")
      .attr("x", 0)
      .attr("y", d => y(d.value))
      .attr("width", x0.bandwidth())
      .attr("height", d => usableArea.height - y(d.value))
      .attr("fill", (d, i) => {
        if (bothPresent && i === 1) {
          return "grey";
        } else {
          return d.category === "standard" ? "steelblue" : "orange";
        }
      })
      .attr("opacity", 1);
  });

  // Add x-axis (hours) and y-axis (average glucose).
  g.append("g")
    .attr("transform", `translate(0,${usableArea.height})`)
    .call(d3.axisBottom(x0).tickFormat(d => `${d}:00`));

  g.append("g")
    .call(d3.axisLeft(y));
}
