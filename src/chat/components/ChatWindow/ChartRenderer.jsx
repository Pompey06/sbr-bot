import React, { useEffect, useState } from "react";

export const ChartRenderer = ({ chartId }) => {
  const [chartHtml, setChartHtml] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!chartId) return;
    const fetchChart = async () => {
      try {
        const res = await fetch(
          `http://172.16.17.4:8001/api/charts/${chartId}`,
        );
        const data = await res.json();
        if (data.success && data.chart_html) {
          setChartHtml(data.chart_html);
        } else {
          setError("Chart data not available");
        }
      } catch (err) {
        setError("Error loading chart");
      }
    };
    fetchChart();
  }, [chartId]);

  if (error) return <div className="text-red-500 text-sm">{error}</div>;
  if (!chartHtml)
    return <div className="text-gray-400 text-sm">Загрузка графика...</div>;

  return (
    <div
      className="chart-container w-full"
      dangerouslySetInnerHTML={{ __html: chartHtml }}
    />
  );
};
