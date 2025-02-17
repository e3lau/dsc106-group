import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

async function loadCSV(filePath) {
  return await d3.csv(filePath);
}

const dexcoms = {};
const foodLogs = {};
const formatDate = d3.timeFormat("%Y-%m-%d");
const formatHour = d3.timeFormat("%H");

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
      let parsedDateTime = Date.parse(row["Timestamp (YYYY-MM-DDThh:mm:ss)"]);
      row["Timestamp (YYYY-MM-DDThh:mm:ss)"] = new Date(parsedDateTime);
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
      /*
      let parsedDate = Date.parse(newRow.date);
      newRow.date = isNaN(parsedDate) ? new Date() : new Date(parsedDate);
      */

      let parsedTimeBegin = Date.parse(newRow.time_begin);
      newRow.time_begin = isNaN(parsedTimeBegin) ? null : new Date(parsedTimeBegin);

      // For time_of_day, if available, assume it's a time string; otherwise fallback to time_begin.
      /*
      if (newRow.time_of_day) {
         newRow.time_of_day = new Date(`1970-01-01T${newRow.time_of_day}`);
      } else if (newRow.time_begin) {
         newRow.time_of_day = newRow.time_begin;
      } else {
         newRow.time_of_day = null;
      }
      */
      
      return newRow;
    });
    foodLogs[`id_${id}`] = data;
  }

  console.log(formatDate(foodLogs['id_005'][0].time_begin));
  console.log(formatHour(foodLogs['id_005'][0].time_begin));
  
  // For each subject’s food logs, group by day and set a new boolean flag,
  // hasStandardBreakfast, to true if any entry on that day has "Standard Breakfast"
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

  console.log("Food Log id_005 head:", foodLogs["id_005"].slice(0, 50));
  renderHistogram("id_001", dexcoms, foodLogs);
})();

////// Render Overlapping Histogram with Tooltip and Legend //////
function renderHistogram(person, dexcoms, foodLogs) {
  if (!dexcoms[person] || dexcoms[person].length === 0) {
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

  // Create a mapping from day (YYYY-MM-DD) to hasStandardBreakfast flag.
  const foodLogData = foodLogs[person];
  const breakfastMap = {};
  foodLogData.forEach(d => {
    const day = formatDate(d.time_begin);
    breakfastMap[day] = breakfastMap[day] || d.hasStandardBreakfast;
  });

  // Initialize arrays to store sums and counts for each hour for each category (glucose)
  const standardSums = Array(24).fill(0);
  const standardCounts = Array(24).fill(0);
  const nonStandardSums = Array(24).fill(0);
  const nonStandardCounts = Array(24).fill(0);

  // Process each Dexcom reading.
  dexcoms[person].forEach(d => {
    const readingDate = d["Timestamp (YYYY-MM-DDThh:mm:ss)"];
    const day = formatDate(readingDate);
    const hour = +formatHour(readingDate); // Convert to number
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

  // --- Compute average fat consumption per hour from food log data ---
  const standardFatSums = Array(24).fill(0);
  const standardFatCounts = Array(24).fill(0);
  const nonStandardFatSums = Array(24).fill(0);
  const nonStandardFatCounts = Array(24).fill(0);

  foodLogData.forEach(d => {
      // Convert total_fat to number if possible.
      const fat = +d.total_fat;
      if (!isNaN(fat) && d.time_begin) {
         const hour = formatHour(d.time_begin);
         if (d.hasStandardBreakfast) {
            standardFatSums[hour] += fat;
            standardFatCounts[hour] += 1;
         } else {
            nonStandardFatSums[hour] += fat;
            nonStandardFatCounts[hour] += 1;
         }
      }
  });

  // Compute average values for each hour for both glucose and fat.
  const histogramData = [];
  for (let h = 0; h < 24; h++) {
    histogramData.push({
      hour: h,
      // Glucose averages:
      standard: standardCounts[h] > 0 ? standardSums[h] / standardCounts[h] : 0,
      nonstandard: nonStandardCounts[h] > 0 ? nonStandardSums[h] / nonStandardCounts[h] : 0,
      // Fat averages:
      fatStandard: standardFatCounts[h] > 0 ? standardFatSums[h] / standardFatCounts[h] : 0,
      fatNonstandard: nonStandardFatCounts[h] > 0 ? nonStandardFatSums[h] / nonStandardFatCounts[h] : 0,
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

  // Define categories for the glucose bars
  const categories = ["standard", "nonstandard"];

  // Create a tooltip div (appended to the body)
  const tooltip = d3.select("body").append("div")
      .attr("id", "tooltip")
      .style("position", "absolute")
      .style("padding", "5px")
      .style("background", "lightgrey")
      .style("border", "1px solid #ccc")
      .style("border-radius", "3px")
      .style("pointer-events", "none")
      .style("opacity", 0);

  // Create groups for each hour and append overlapping bars.
  const hourGroups = g.selectAll(".hourGroup")
    .data(histogramData)
    .enter()
    .append("g")
    .attr("class", "hourGroup")
    .attr("transform", d => `translate(${x0(d.hour)},0)`);

  // In each hour group, create an array for both category values and draw the bars.
  hourGroups.each(function(d) {
    const dataArray = categories.map(cat => ({ category: cat, value: d[cat] }));
    // Sort descending so that the taller bar is drawn first.
    dataArray.sort((a, b) => b.value - a.value);
    
    // Check if both categories have nonzero values.
    const bothPresent = dataArray.every(obj => obj.value > 0);
    
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
      .attr("opacity", 1)
      // Add tooltip events to each bar.
      .on("mouseover", function(event, d_cat) {
         // Retrieve the parent group's datum which holds the hour's full data.
         const parentData = d3.select(this.parentNode).datum();
         tooltip.transition().duration(200).style("opacity", 0.9);
         tooltip.html(
           `<strong>Hour:</strong> ${parentData.hour}:00<br/>
            <strong>Glucose (mg/dL):</strong><br/>Standard: ${parentData.standard.toFixed(2)}<br/>Nonstandard: ${parentData.nonstandard.toFixed(2)}<br/>
            <strong>Fat:</strong><br/>Standard: ${parentData.fatStandard.toFixed(2)}<br/>Nonstandard: ${parentData.fatNonstandard.toFixed(2)}`
         )
         .style("left", (event.pageX + 10) + "px")
         .style("top", (event.pageY - 28) + "px");
      })
      .on("mousemove", function(event, d) {
         tooltip.style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 28) + "px");
      })
      .on("mouseout", function(event, d) {
         tooltip.transition().duration(500).style("opacity", 0);
      });
  });

  // Add x-axis (hours) and y-axis (average glucose).
  g.append("g")
    .attr("transform", `translate(0,${usableArea.height})`)
    .call(d3.axisBottom(x0).tickFormat(d => `${d}:00`));

  g.append("g")
    .call(d3.axisLeft(y));

  // --- Add an offset legend ---
  // Position the legend towards the top-right of the SVG.
  const legend = svg.append("g")
      .attr("transform", `translate(${width - 150},${margin.top})`);

  const legendData = [
      { label: "Standard", color: "steelblue" },
      { label: "Nonstandard", color: "orange" }
  ];

  legend.selectAll("rect")
      .data(legendData)
      .enter()
      .append("rect")
      .attr("x", 0)
      .attr("y", (d, i) => i * 25)
      .attr("width", 20)
      .attr("height", 20)
      .attr("fill", d => d.color);

  legend.selectAll("text")
      .data(legendData)
      .enter()
      .append("text")
      .attr("x", 30)
      .attr("y", (d, i) => i * 25 + 15)
      .text(d => d.label)
      .attr("font-size", "14px")
      .attr("fill", "#000");
}
