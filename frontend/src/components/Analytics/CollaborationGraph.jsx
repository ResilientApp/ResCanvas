import React, { useRef, useEffect } from 'react';
import * as d3 from 'd3';

// Force-directed collaboration graph using d3-force.
export default function CollaborationGraph({ pairs = [], width = 600, height = 300 }) {
  const ref = useRef();

  useEffect(() => {
    const nodeMap = new Map();
    const links = [];
    pairs.forEach((p) => {
      const a = p[0];
      const b = p[1];
      const w = p[2] || 1;
      if (!nodeMap.has(a)) nodeMap.set(a, { id: a });
      if (!nodeMap.has(b)) nodeMap.set(b, { id: b });
      links.push({ source: a, target: b, weight: w });
    });
    const nodes = Array.from(nodeMap.values());

    const svg = d3.select(ref.current);
    svg.selectAll('*').remove();

    svg.attr('viewBox', `0 0 ${width} ${height}`).style('width', '100%').style('height', 'auto');

    const link = svg.append('g')
      .attr('stroke', '#999')
      .attr('stroke-opacity', 0.6)
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke-width', d => Math.sqrt(d.weight));

    function ticked() {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

      node
        .attr('cx', d => d.x)
        .attr('cy', d => d.y);

      label
        .attr('x', d => d.x)
        .attr('y', d => d.y);
    }

    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(50).strength(d => Math.min(0.9, d.weight / 10)))
      .force('charge', d3.forceManyBody().strength(-120))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .on('tick', ticked);

    function drag(sim) {
      function dragstarted(event, d) {
        if (!event.active) sim.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      }

      function dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
      }

      function dragended(event, d) {
        if (!event.active) sim.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      }

      return d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended);
    }

    const node = svg.append('g')
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5)
      .selectAll('circle')
      .data(nodes)
      .join('circle')
      .attr('r', 8)
      .attr('fill', '#25D8C5')
      .call(drag(simulation));

    const label = svg.append('g')
      .selectAll('text')
      .data(nodes)
      .join('text')
      .attr('font-size', 10)
      .attr('dx', 12)
      .attr('dy', '.35em')
      .text(d => d.id);

    return () => {
      simulation?.stop();
    };
  }, [pairs, width, height]);

  return (
    <div style={{ padding: 12 }}>
      <h4>Collaboration Graph</h4>
      <svg ref={ref} />
    </div>
  );
}
