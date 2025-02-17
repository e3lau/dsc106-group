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

  // Update: Use d.glucose if that's your property
  const x = d3.scaleLinear()
    .domain([0, d3.max(dexcoms["id_001"], d => {
        const glucose = +d["Glucose Value (mg/dL)"];
        return isNaN(glucose) ? 0 : glucose; // Replace NaN with 0
    })])
    .range([0, usableArea.width]);

  // Create histogram bins
  const histogram = d3.histogram()
      .value(d => d["Glucose Value (mg/dL)"])
      .domain(x.domain())
      .thresholds(x.ticks(20)); // 20 bins

  const bins = histogram(dexcoms['id_001']);

  // Y scale
  const y = d3.scaleLinear()
      .domain([0, d3.max(bins, d => d.length)])
      .range([usableArea.height, 0]);

  // Append bars
  svg.selectAll("rect")
      .data(bins)
      .enter().append("rect")
      .attr("x", d => x(d.x0))
      .attr("y", d => y(d.length))
      .attr("width", usableArea.width / bins.length - 2)
      .attr("height", d => usableArea.height - y(d.length))
      .attr("fill", "steelblue");

  // Add X-axis
  svg.append("g")
      .attr("transform", `translate(0,${usableArea.height})`)
      .call(d3.axisBottom(x));

  // Add Y-axis
  svg.append("g")
      .call(d3.axisLeft(y));
}

