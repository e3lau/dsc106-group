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
      row.date = row["Timestamp (YYYY-MM-DDThh:mm:ss)"].toISOString().split("T")[0];
      row["Glucose Value (mg/dL)"] = +row["Glucose Value (mg/dL)"];
    });
    dexcoms[`id_${id}`] = data;
  }
  console.log("Dexcom id_001 head:", dexcoms["id_001"].slice(0, 5));
  console.log("Dexcom id_001 head:", dexcoms["id_001"][0]);

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

      newRow.date = new Date(newRow.date);

      const timeStr = newRow.time_of_day ? newRow.time_of_day : newRow.time_begin;
      newRow.time_of_day = timeStr ? new Date(`1970-01-01T${timeStr}`) : null;
      newRow.time_begin = new Date(newRow.time_begin);
      return newRow;
    });
    foodLogs[`id_${id}`] = data;
  }
  console.log("Food Log id_001 head:", foodLogs["id_001"].slice(0, 5));
  renderHistogram(dexcoms, foodLogs)
})();

////// Build Histogram //////
function renderHistogram(dexcoms, foodLogs) {
    if (!dexcoms["id_001"] || dexcoms["id_001"].length === 0) {
        console.error("No data available for histogram.");
        return;
    }

  // Set up dimensions
  const width = 1000;
  const height = 600;
  const margin = { top: 10, right: 10, bottom: 30, left: 20 };
  const usableArea = {
      top: margin.top,
      right: width - margin.right,
      bottom: height - margin.bottom,
      left: margin.left,
      width: width - margin.left - margin.right,
      height: height - margin.top - margin.bottom,
  };
  
  // Append SVG element
  const svg = d3.select('#chart')
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .style('overflow', 'visible');

  // Initialize data structures for sum and count
  const glucoseSums = Array(24).fill(0);
  const glucoseCounts = Array(24).fill(0);

  // Process each data point
  dexcoms["id_001"].forEach(d => {
    const hour = new Date(d["Timestamp (YYYY-MM-DDThh:mm:ss)"]).getHours();
    const glucose = +d["Glucose Value (mg/dL)"];
    
    if (!isNaN(glucose)) {
      glucoseSums[hour] += glucose;
      glucoseCounts[hour] += 1;
    }
  });

  // Compute average glucose per hour
  const histogramData = glucoseSums.map((sum, hour) => ({
    hour,
    avgGlucose: glucoseCounts[hour] > 0 ? sum / glucoseCounts[hour] : 0
  }));

  // X Scale (Hours of the day)
  const x = d3.scaleBand()
    .domain(histogramData.map(d => d.hour))
    .range([0, usableArea.width])
    .padding(0.1);

  // Y Scale (Average glucose values)
  const y = d3.scaleLinear()
    .domain([0, d3.max(histogramData, d => d.avgGlucose) || 200])
    .range([usableArea.height, 0]);

  // Append bars
  svg.append("g")
    .selectAll("rect")
    .data(histogramData)
    .enter().append("rect")
    .attr("x", d => x(d.hour))
    .attr("y", d => y(d.avgGlucose))
    .attr("width", x.bandwidth())
    .attr("height", d => usableArea.height - y(d.avgGlucose))
    .attr("fill", "steelblue");

  // X-axis
  svg.append("g")
    .attr("transform", `translate(0,${usableArea.height})`)
    .call(d3.axisBottom(x).tickFormat(d => `${d}:00`));

  // Y-axis
  svg.append("g")
    .call(d3.axisLeft(y));
}

