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
})();

////// Build Histogram //////
function renderHistogram(dexcoms, foodLogs) {
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
      .domain([0, d3.max(dexcoms['id_001'], d => d)]) // Data range
      .range([0, usableArea.width]);

  // Create histogram bins using d.glucose
  const histogram = d3.histogram()
      .value(d => d.glucose)
      .domain(x.domain())
      .thresholds(x.ticks(24)); // 24 bins

  const bins = histogram(dexcoms['id_001']);

  // Group data by bin and (later) by category.
  // For now, if you haven't defined categories, this part might be adjusted.
  const binGroups = bins.map(bin => {
      let counts = { bin: bin.x0 };
      // Assuming d.category exists. Otherwise, define your categories here.
      bin.forEach(d => { 
          counts[d.category] = (counts[d.category] || 0) + 1;
      });
      return counts;
  });  // <-- Added closing parenthesis here

  // Create a stack generator.
  // If testing only with id_001, stacking by individual IDs might not work.
  // Instead, decide on a relevant categorical key (e.g., "standard" vs. "non-standard").
  const stack = d3.stack()
      .keys(Object.keys(dexcoms)) // This will later be replaced with your chosen categorical keys
      .value((d, key) => d[key] || 0);

  const stackedData = stack(binGroups);

  // Y Scale based on stacked data
  const y = d3.scaleLinear()
      .domain([0, d3.max(stackedData, d => d3.max(d, d => d[1]))])
      .range([usableArea.height, 0]);

  // Color scale for different categories (or individuals)
  const color = d3.scaleOrdinal()
      .domain(Object.keys(dexcoms))
      .range(d3.schemeCategory10);

  // Append stacked bars
  svg.selectAll("g.layer")
      .data(stackedData)
      .enter().append("g")
      .attr("class", "layer")
      .attr("fill", d => color(d.key))
      .selectAll("rect")
      .data(d => d)
      .enter().append("rect")
      .attr("x", d => x(d.data.bin))
      .attr("y", d => y(d[1]))
      .attr("height", d => y(d[0]) - y(d[1]))
      .attr("width", usableArea.width / bins.length - 2);

  // Add X-axis
  svg.append("g")
      .attr("transform", `translate(0,${usableArea.height})`)
      .call(d3.axisBottom(x));

  // Add Y-axis
  svg.append("g")
      .call(d3.axisLeft(y));
}

renderHistogram(dexcoms, foodLogs)