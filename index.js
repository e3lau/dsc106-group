import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

async function loadCSV(filePath) {
  return await d3.csv(filePath);
}

/// Corrupted Data Skip
const skipIDs = [3, 7, 13, 15, 16];

const dexcoms = {};
const foodLogs = {};
const formatDate = d3.timeFormat("%Y-%m-%d");
const formatHour = d3.timeFormat("%H");

(async () => {
  const demographics = await loadCSV("data/Demographics.csv");
  console.log("Demographics head:", demographics.slice(0, 5));

  // Load Dexcom data
  for (let i = 1; i <= 16; i++) {
    if (skipIDs.includes(i)) continue;
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
    if (skipIDs.includes(i)) continue;
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

      let parsedTimeBegin = Date.parse(newRow.time_begin);
      newRow.time_begin = isNaN(parsedTimeBegin) ? null : new Date(parsedTimeBegin);
      
      return newRow;
    });
    foodLogs[`id_${id}`] = data;
  }
  
  // For each subject’s food logs, group by day and set a new boolean flag,
  // hasStandardBreakfast, to true if any entry on that day has a "Standard Breakfast"
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
  renderHistogram(["id_011"], dexcoms, foodLogs);
})();

////// Render Overlapping Histogram with Tooltip and Legend //////
function renderHistogram(persons, dexcoms, foodLogs) {
  if (!Array.isArray(persons)) {
      console.error("Input must be an array of person IDs.");
      return;
  }

  let combinedDexcomData = [];
  let combinedFoodLogData = [];

  persons.forEach(person => {
      if (dexcoms[person]) {
          combinedDexcomData = combinedDexcomData.concat(dexcoms[person]);
      }
      if (foodLogs[person]) {
          combinedFoodLogData = combinedFoodLogData.concat(foodLogs[person]);
      }
  });

  /// Error Catcher if data does not exist for person id
  if (combinedDexcomData.length === 0) {
    console.error("No data available for histogram.");
    
    let chartsContainer = document.getElementById("chart");
    if (chartsContainer) {
      const placeholderMessage = document.createElement('p');
      placeholderMessage.textContent = 'No data available for this person id!';
      placeholderMessage.style.color = 'red';
      chartsContainer.appendChild(placeholderMessage);
    } else {
      console.warn("Chart container not found.");
    }
  
    return;
  }

  // Set up dimensions and margins
  const width = 1000;
  const height = 600;
  const margin = { top: 10, right: 10, bottom: 30, left: 30 };
  const usableArea = {
    top: margin.top,
    right: width - margin.right,
    bottom: height - margin.bottom,
    left: margin.left,
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
  };

  // Append SVG element and group for margins
  const svg = d3
    .select('#chart')
    .append('svg')
    .attr('viewBox', `-10 0 ${width} ${height}`)
    .style('overflow', 'visible');
    
  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // Create a mapping from day (YYYY-MM-DD) to hasStandardBreakfast flag.
  const foodLogData = combinedFoodLogData;
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
  combinedDexcomData.forEach(d => {
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
            <strong>Glucose (mg/dL):</strong><br/>Standard: ${parentData.standard.toFixed(2)}<br/>Self-Chosen: ${parentData.nonstandard.toFixed(2)}<br/>
            <strong>Fat:</strong><br/>Standard: ${parentData.fatStandard.toFixed(2)}<br/>Self-Chosen: ${parentData.fatNonstandard.toFixed(2)}`
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

  g.append("g").call(d3.axisLeft(y));
  
  // add axis labels
  svg.append("text")
    .attr("x", width / 2)
    .attr("y", height + margin.bottom - 10)
    .attr("text-anchor", "middle")
    .style("font-size", "14px")
    .text("Hour of Day"); // X-axis label
  
  svg.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -height / 2)
    .attr("y", -margin.left + 20)
    .attr("text-anchor", "middle")
    .style("font-size", "14px")
    .text("Average Glucose Level (mg/dL)"); // Y-axis label

  // --- Add an offset legend ---
  // Position the legend towards the top-right of the SVG.
  const legendWidth = 478; // Adjust based on total width needed for legend items
    const legendX = (width - legendWidth) / 2 + margin.left; // Centers legend within chart area

    const legend = svg.append("g")
        .attr("transform", `translate(${legendX}, ${height + margin.bottom - 650})`); // Moves legend below the chart

  const legendData = [
      { label: "Standard Breakfast Days", color: "steelblue" },
      { label: "Self-Chosen Breakfast Days", color: "orange" }
  ];

  const legendItems = legend.selectAll("g")
    .data(legendData)
    .enter()
    .append("g")
    .attr("transform", (d, i) => `translate(${i * 200}, 0)`); // Adjusts x-position for spacing

    legendItems.append("rect")
        .attr("width", 20)
        .attr("height", 20)
        .attr("fill", d => d.color);

    legendItems.append("text")
        .attr("x", 30)
        .attr("y", 15)
        .text(d => d.label)
        .attr("font-size", "14px")
        .attr("fill", "#000");
}
