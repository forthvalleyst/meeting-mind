import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

function MindMap({ history, topicClassification }) {
  const svgRef = useRef();
  const [viewMode, setViewMode] = useState('stance'); // 'stance' or 'topic'

  useEffect(() => {
    if (!history || history.length === 0) return;

    // SVGをクリア
    d3.select(svgRef.current).selectAll("*").remove();

    let treeData;

    if (viewMode === 'topic' && topicClassification && topicClassification.topics) {
      // トピック別ビュー
      treeData = {
        name: '会議の\nトピック',
        children: topicClassification.topics.map(topic => ({
          name: topic.name,
          description: topic.description,
          children: topic.speech_indices.map(index => {
            const item = history[index];
            if (!item) return null;
            return {
              name: item.transcript.length > 30 ? item.transcript.substring(0, 30) + '...' : item.transcript,
              fullText: item.transcript,
              topic: item.analysis.topic,
              stance: item.analysis.stance
            };
          }).filter(Boolean)
        }))
      };
    } else {
      // 立場別ビュー (既存)
      const stanceGroups = {
        '賛成': [],
        '反対': [],
        '中立': [],
        '条件付き賛成': [],
        '条件付き反対': []
      };

      history.forEach((item, index) => {
        const stance = item.analysis.stance;
        if (stanceGroups[stance]) {
          stanceGroups[stance].push({
            id: `node-${index}`,
            text: item.transcript,
            topic: item.analysis.topic,
            index: index
          });
        }
      });

      treeData = {
        name: '会議の\nトピック',
        children: Object.entries(stanceGroups)
          .filter(([_, nodes]) => nodes.length > 0)
          .map(([stance, nodes]) => ({
            name: stance,
            stance: stance,
            children: nodes.map(node => ({
              name: node.text.length > 30 ? node.text.substring(0, 30) + '...' : node.text,
              fullText: node.text,
              topic: node.topic,
              stance: stance
            }))
          }))
      };
    }

    // SVGサイズ
    const margin = { top: 50, right: 150, bottom: 50, left: 150 };
    const width = 1000;
    const height = Math.max(600, history.length * 80);

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height);

    // 背景
    svg.append('rect')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', '#f9fafb');

    const g = svg.append('g')
      .attr('transform', `translate(${width / 2 - 200},${margin.top})`);

    // ツリーレイアウト
    const treeLayout = d3.tree()
      .size([width - margin.left - margin.right, height - margin.top - margin.bottom])
      .separation((a, b) => {
        return a.parent === b.parent ? 2.5 : 3;
      });

    const root = d3.hierarchy(treeData);
    treeLayout(root);

    // リンク
    g.selectAll('.link')
      .data(root.links())
      .enter()
      .append('path')
      .attr('class', 'link')
      .attr('d', d3.linkVertical()
        .x(d => d.x)
        .y(d => d.y))
      .attr('fill', 'none')
      .attr('stroke', '#ccc')
      .attr('stroke-width', 2);

    // ノードグループ
    const node = g.selectAll('.node')
      .data(root.descendants())
      .enter()
      .append('g')
      .attr('class', 'node')
      .attr('transform', d => `translate(${d.x},${d.y})`);

    // 円
    node.append('circle')
      .attr('r', d => {
        if (d.depth === 0) return 60;
        if (d.depth === 1) return 45;
        return 35;
      })
      .attr('fill', d => {
        if (d.depth === 0) return '#667eea';
        if (d.depth === 1) {
          if (viewMode === 'topic') {
            // トピック別: 紫系グラデーション
            const topicColors = ['#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe', '#ede9fe'];
            const index = d.parent.children.indexOf(d);
            return topicColors[index % topicColors.length];
          } else {
            // 立場別: 既存の色
            const stanceColors = {
              '賛成': '#10b981',
              '反対': '#ef4444',
              '中立': '#f59e0b',
              '条件付き賛成': '#3b82f6',
              '条件付き反対': '#8b5cf6'
            };
            return stanceColors[d.data.stance] || '#94a3b8';
          }
        }
        // 発言ノード
        const stanceColors = {
          '賛成': '#10b981',
          '反対': '#ef4444',
          '中立': '#f59e0b',
          '条件付き賛成': '#3b82f6',
          '条件付き反対': '#8b5cf6'
        };
        return stanceColors[d.data.stance] || '#94a3b8';
      })
      .attr('stroke', '#fff')
      .attr('stroke-width', 3);

    // テキスト
    node.each(function(d) {
      const nodeGroup = d3.select(this);
      
      if (d.depth === 0) {
        // 中央ノード
        const lines = d.data.name.split('\n');
        lines.forEach((line, i) => {
          nodeGroup.append('text')
            .attr('dy', `${(i - lines.length/2 + 0.5) * 1.2}em`)
            .attr('text-anchor', 'middle')
            .attr('fill', 'white')
            .style('font-size', '14px')
            .style('font-weight', 'bold')
            .text(line);
        });
      } else if (d.depth === 1) {
        // 第2階層 (立場 or トピック)
        const text = d.data.name.length > 10 ? d.data.name.substring(0, 10) + '...' : d.data.name;
        
        // 白い縁取り（影）を追加
        nodeGroup.append('text')
          .attr('text-anchor', 'middle')
          .attr('dy', '0.35em')
          .attr('fill', 'none')
          .attr('stroke', 'white')
          .attr('stroke-width', 4)
          .style('font-size', '12px')
          .style('font-weight', 'bold')
          .text(text);
        
        // 本体（黒文字）
        nodeGroup.append('text')
          .attr('text-anchor', 'middle')
          .attr('dy', '0.35em')
          .attr('fill', '#333')
          .style('font-size', '12px')
          .style('font-weight', 'bold')
          .text(text);
      } else {
        // 発言ノード
        const shortText = d.data.name.length > 8 ? d.data.name.substring(0, 8) + '...' : d.data.name;
        
        // 影
        nodeGroup.append('text')
          .attr('text-anchor', 'middle')
          .attr('dy', '0.35em')
          .attr('fill', 'none')
          .attr('stroke', '#000')
          .attr('stroke-width', 3)
          .style('font-size', '11px')
          .text(shortText);
        
        // 本体
        nodeGroup.append('text')
          .attr('text-anchor', 'middle')
          .attr('dy', '0.35em')
          .attr('fill', 'white')
          .style('font-size', '11px')
          .style('font-weight', 'bold')
          .text(shortText);
      }
    });

    // ツールチップ
    const tooltip = d3.select('body').append('div')
      .attr('class', 'mindmap-tooltip')
      .style('position', 'absolute')
      .style('visibility', 'hidden')
      .style('background-color', 'rgba(0, 0, 0, 0.9)')
      .style('color', 'white')
      .style('padding', '12px')
      .style('border-radius', '8px')
      .style('font-size', '13px')
      .style('max-width', '350px')
      .style('z-index', '10000')
      .style('pointer-events', 'none')
      .style('box-shadow', '0 4px 6px rgba(0, 0, 0, 0.3)');

    node.on('mouseover', function(event, d) {
      if (d.depth === 2) {
        tooltip
          .style('visibility', 'visible')
          .html(`<strong>発言:</strong><br/>${d.data.fullText}<br/><br/><strong>トピック:</strong><br/>${d.data.topic}`);
      } else if (d.depth === 1 && viewMode === 'topic') {
        tooltip
          .style('visibility', 'visible')
          .html(`<strong>${d.data.name}</strong><br/>${d.data.description}`);
      } else if (d.depth === 0) {
        tooltip
          .style('visibility', 'visible')
          .html('<strong>会議のトピック</strong><br/>発言が分類されています');
      }
    })
    .on('mousemove', function(event) {
      // ツールチップのサイズを取得
      const tooltipNode = tooltip.node();
      const tooltipWidth = tooltipNode ? tooltipNode.offsetWidth : 300;
      const tooltipHeight = tooltipNode ? tooltipNode.offsetHeight : 100;
      
      // 画面のサイズを取得
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      
      // デフォルト位置 (右下)
      let left = event.pageX + 10;
      let top = event.pageY + 10;
      
      // 右端をはみ出る場合は左側に表示
      if (left + tooltipWidth > windowWidth - 20) {
        left = event.pageX - tooltipWidth - 10;
      }
      
      // 下端をはみ出る場合は上側に表示
      if (top + tooltipHeight > windowHeight - 20) {
        top = event.pageY - tooltipHeight - 10;
      }
      
      // 左端より左に行かないように
      if (left < 10) {
        left = 10;
      }
      
      // 上端より上に行かないように
      if (top < 10) {
        top = 10;
      }
      
      tooltip
        .style('top', top + 'px')
        .style('left', left + 'px');
    })
    .on('mouseout', function() {
      tooltip.style('visibility', 'hidden');
    });

    return () => {
      tooltip.remove();
    };

  }, [history, topicClassification, viewMode]);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      {/* タブ切り替え */}
      <div style={{ 
        display: 'flex', 
        gap: '0.5rem', 
        marginBottom: '1rem',
        borderBottom: '2px solid #e5e7eb',
        paddingBottom: '0.5rem'
      }}>
        <button
          onClick={() => setViewMode('stance')}
          style={{
            padding: '0.5rem 1rem',
            background: viewMode === 'stance' ? '#667eea' : '#e5e7eb',
            color: viewMode === 'stance' ? 'white' : '#666',
            border: 'none',
            borderRadius: '8px 8px 0 0',
            cursor: 'pointer',
            fontWeight: viewMode === 'stance' ? 'bold' : 'normal',
            fontSize: '0.9rem'
          }}
        >
          👥 立場別
        </button>
        <button
          onClick={() => setViewMode('topic')}
          disabled={!topicClassification || history.length < 3}
          style={{
            padding: '0.5rem 1rem',
            background: viewMode === 'topic' ? '#667eea' : '#e5e7eb',
            color: viewMode === 'topic' ? 'white' : '#666',
            border: 'none',
            borderRadius: '8px 8px 0 0',
            cursor: topicClassification ? 'pointer' : 'not-allowed',
            fontWeight: viewMode === 'topic' ? 'bold' : 'normal',
            fontSize: '0.9rem',
            opacity: topicClassification ? 1 : 0.5
          }}
        >
          📋 トピック別
        </button>
        {!topicClassification && history.length < 3 && (
          <span style={{ 
            fontSize: '0.8rem', 
            color: '#999', 
            alignSelf: 'center',
            marginLeft: '0.5rem'
          }}>
            (3発言以上で有効)
          </span>
        )}
      </div>

      {/* マインドマップ */}
      <div style={{ 
        width: '100%', 
        height: 'calc(100% - 60px)',
        overflowX: 'auto', 
        overflowY: 'auto',
        backgroundColor: '#f9fafb',
        borderRadius: '8px'
      }}>
        <svg ref={svgRef}></svg>
      </div>
    </div>
  );
}

export default MindMap;