import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { dexcoms, foodLogs, formatDate, formatHour } from '../data_processing.js';

// Person ID Replacement IDs
const personLabels = {
    "id_001": "ID_1",
    "id_002": "ID_2",
    "id_003": "ID_3",
    "id_004": "ID_4",
    "id_005": "ID_5",
    "id_006": "ID_6",
    "id_007": "ID_7",
    "id_008": "ID_8",
    "id_009": "ID_9",
    "id_010": "ID_10",
    "id_011": "ID_11",
    "id_012": "ID_12",
    "id_013": "ID_13",
    "id_014": "ID_14",
    "id_015": "ID_15",
    "id_016": "ID_16",
};

(async () => {
    // Initialize dropdown and histogram
    createDropdown();
    updateHistogram();

    document.getElementById('dropdownButton').addEventListener('click', function () {
        const dropdown = document.getElementById("personDropdown");
        dropdown.style.display = dropdown.style.display === "block" ? "none" : "block";
    });

    // Listen for breakfast toggle changes
    document.getElementById("toggleStandard").addEventListener("change", updateHistogram);
    document.getElementById("toggleNonStandard").addEventListener("change", updateHistogram);
})();

function renderHistogram(persons, dexcoms, foodLogs, includeStandard, includeNonstandard) {
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

    if (combinedDexcomData.length === 0) {
        console.error("No data available for histogram.");
        const chartsContainer = document.getElementById("chart");
        if (chartsContainer) {
            chartsContainer.innerHTML = '';
            const placeholderMessage = document.createElement('p');
            placeholderMessage.textContent = 'No data available for this person id!';
            placeholderMessage.style.color = 'red';
            chartsContainer.appendChild(placeholderMessage);
        }
        return;
    }

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

    // Clear any previous chart content.
    const chartContainer = d3.select("#chart");
    chartContainer.html("");

    const svg = chartContainer.append('svg')
        .attr('viewBox', `-10 0 ${width} ${height}`)
        .style('overflow', 'visible');

    const g = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    // Map each day to a breakfast flag.
    const breakfastMap = {};
    combinedFoodLogData.forEach(d => {
        const day = formatDate(d.time_begin);
        breakfastMap[day] = breakfastMap[day] || d.hasStandardBreakfast;
    });

    const standardSums = Array(24).fill(0);
    const standardCounts = Array(24).fill(0);
    const nonStandardSums = Array(24).fill(0);
    const nonStandardCounts = Array(24).fill(0);

    combinedDexcomData.forEach(d => {
        const readingDate = d["Timestamp (YYYY-MM-DDThh:mm:ss)"];
        const day = formatDate(readingDate);
        const hour = +formatHour(readingDate);
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

    // Compute average glucose values for each hour.
    const histogramData = [];
    for (let h = 0; h < 24; h++) {
        histogramData.push({
            hour: h,
            standard: standardCounts[h] > 0 ? standardSums[h] / standardCounts[h] : 0,
            nonstandard: nonStandardCounts[h] > 0 ? nonStandardSums[h] / nonStandardCounts[h] : 0,
        });
    }

    // Determine which categories to display based on toggle selections.
    let categories = [];
    if (includeStandard) categories.push("standard");
    if (includeNonstandard) categories.push("nonstandard");

    if (categories.length === 0) {
        g.append("text")
            .attr("x", usableArea.width / 2)
            .attr("y", usableArea.height / 2)
            .attr("text-anchor", "middle")
            .attr("fill", "red")
            .text("No breakfast type selected!");
        return;
    }

    const x0 = d3.scaleBand()
        .domain(histogramData.map(d => d.hour))
        .range([0, usableArea.width])
        .padding(0.2);

    const maxAvg = d3.max(histogramData, d => {
        let vals = [];
        if (includeStandard) vals.push(d.standard);
        if (includeNonstandard) vals.push(d.nonstandard);
        return Math.max(...vals);
    }) || 200;

    const y = d3.scaleLinear()
        .domain([0, maxAvg])
        .nice()
        .range([usableArea.height, 0]);

    // Create a tooltip element.
    const tooltip = d3.select("body").append("div")
        .attr("id", "tooltip")
        .style("position", "absolute")
        .style("padding", "5px")
        .style("background", "lightgrey")
        .style("border", "1px solid #ccc")
        .style("border-radius", "3px")
        .style("pointer-events", "none")
        .style("opacity", 0);

    // Create a group for each hour.
    const hourGroups = g.selectAll(".hourGroup")
        .data(histogramData)
        .enter()
        .append("g")
        .attr("class", "hourGroup")
        .attr("transform", d => `translate(${x0(d.hour)},0)`);

    // Define a variable for the overlap color (change this value to your desired color)
    const overlapColor = "#999999";

    hourGroups.each(function (d) {
        const dataArray = categories.map(cat => ({ category: cat, value: d[cat] }));
        // Sort descending so the taller bar is drawn first.
        dataArray.sort((a, b) => b.value - a.value);

        // If both types are present, mark the second bar as "overlap" (using the overlapColor variable)
        const bothPresent = (includeStandard && includeNonstandard) &&
            dataArray.every(obj => obj.value > 0);

        d3.select(this).selectAll("rect")
            .data(dataArray)
            .enter()
            .append("rect")
            .attr("x", 0)
            .attr("y", d_item => y(d_item.value))
            .attr("width", x0.bandwidth())
            .attr("height", d_item => usableArea.height - y(d_item.value))
            .attr("fill", (d_item, i) => {
                if (bothPresent && i === 1) {
                    return overlapColor;
                } else {
                    return d_item.category === "standard" ? "steelblue" : "orange";
                }
            })
            .attr("opacity", 1)
            .on("mouseover", function (event, d_item) {
                const parentData = d3.select(this.parentNode).datum();
                tooltip.transition().duration(200).style("opacity", 0.9);
                let tooltipHTML = `<strong>Hour:</strong> ${parentData.hour}:00<br/>`;
                if (includeStandard) {
                    tooltipHTML += `<strong>Standard:</strong> ${parentData.standard.toFixed(2)}<br/>`;
                }
                if (includeNonstandard) {
                    tooltipHTML += `<strong>Self-Chosen:</strong> ${parentData.nonstandard.toFixed(2)}<br/>`;
                }
                tooltip.html(tooltipHTML)
                    .style("left", (event.pageX + 10) + "px")
                    .style("top", (event.pageY - 28) + "px");
            })
            .on("mousemove", function (event) {
                tooltip.style("left", (event.pageX + 10) + "px")
                    .style("top", (event.pageY - 28) + "px");
            })
            .on("mouseout", function () {
                tooltip.transition().duration(500).style("opacity", 0);
            });
    });

    // Add x-axis and y-axis.
    g.append("g")
        .attr("transform", `translate(0,${usableArea.height})`)
        .call(d3.axisBottom(x0).tickFormat(d => `${d}:00`));

    g.append("g")
        .call(d3.axisLeft(y));

    // Axis Labels
    svg.append("text")
        .attr("x", width / 2)
        .attr("y", height + margin.bottom - 10)
        .attr("text-anchor", "middle")
        .style("font-size", "14px")
        .style("font-weight", "bold")
        .text("Hour of Day");

    svg.append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -height / 2)
        .attr("y", -margin.left + 20)
        .attr("text-anchor", "middle")
        .style("font-size", "14px")
        .style("font-weight", "bold")
        .text("Average Glucose Level (mg/dL)");

    // Construct legend data.
    const legendData = [];
    if (includeStandard) {
        legendData.push({ label: "Standard Breakfast Days", color: "steelblue" });
    }
    if (includeNonstandard) {
        legendData.push({ label: "Self-Chosen Breakfast Days", color: "orange" });
    }
    // Add a third legend item for overlap if both toggles are enabled.
    if (includeStandard && includeNonstandard) {
        legendData.push({ label: "Overlap", color: overlapColor });
    }

    // Center the legend horizontally based on the number of items.
    const legendX = width / 2 - ((legendData.length * 180) / 2);

    const legend = svg.append("g")
        .attr("transform", `translate(${legendX}, ${height + margin.bottom - 650})`);

    // Legend items with a spacing of 225px between groups.
    const legendItems = legend.selectAll("g")
        .data(legendData)
        .enter()
        .append("g")
        .attr("transform", (d, i) => `translate(${i * 225}, 0)`);

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

function createDropdown() {
    const dropdown = document.getElementById("personDropdown");
    dropdown.innerHTML = "";

    Object.keys(dexcoms).forEach(id => {
        const labelText = personLabels[id] || id;
        const label = document.createElement("label");
        label.innerHTML = `<input type="checkbox" value="${id}" class="personCheckbox" checked> ${labelText}`;
        dropdown.appendChild(label);
    });

    document.querySelectorAll(".personCheckbox").forEach(checkbox => {
        checkbox.addEventListener("change", updateHistogram);
    });
}

function updateHistogram() {
    const selectedPersons = [...document.querySelectorAll(".personCheckbox:checked")]
        .map(cb => cb.value);

    const chartSubtitleCount = document.querySelector('.chart-subtitle-count');
    const selectedNames = selectedPersons.map(id => personLabels[id] || id);
    let formattedNames = "";
    if (selectedNames.length === 1) {
        formattedNames = selectedNames[0];
    } else if (selectedNames.length === 2) {
        formattedNames = selectedNames.join(" and ");
    } else if (selectedNames.length > 2) {
        formattedNames = selectedNames.slice(0, -1).join(", ") + ", and " + selectedNames[selectedNames.length - 1];
    }
    chartSubtitleCount.textContent = formattedNames;

    // Retrieve breakfast toggle states.
    const includeStandard = document.getElementById("toggleStandard").checked;
    const includeNonstandard = document.getElementById("toggleNonStandard").checked;

    d3.select("#chart").html("");

    if (selectedPersons.length > 0) {
        renderHistogram(selectedPersons, dexcoms, foodLogs, includeStandard, includeNonstandard);
    } else {
        const chartsContainer = document.getElementById("chart");
        if (chartsContainer) {
            const placeholderMessage = document.createElement('p');
            placeholderMessage.textContent = 'No Persons Selected!';
            placeholderMessage.style.color = 'red';
            chartsContainer.appendChild(placeholderMessage);
            chartSubtitleCount.textContent = "NULL";
            console.log("No persons selected.");
        } else {
            console.warn("Chart container not found.");
        }
    }
}