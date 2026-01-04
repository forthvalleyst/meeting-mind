import React, { useState } from 'react';
import './App.css';
import MindMap from './MindMap';

function App() {
  const [transcript, setTranscript] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [history, setHistory] = useState([]);
  const [gaps, setGaps] = useState(null);
  const [theme, setTheme] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [voiceRecognition, setVoiceRecognition] = useState(null);
  const [autoAnalyze, setAutoAnalyze] = useState(false);
  const [topicClassification, setTopicClassification] = useState(null);

  // 音声入力開始
  const startVoiceInput = () => {
    // ブラウザ対応チェック
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      alert('このブラウザは音声入力に対応していません。Chrome または Edge をお使いください。');
      return;
    }

    // 既に録音中の場合は停止
    if (isRecording && voiceRecognition) {
      voiceRecognition.stop();
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'ja-JP';
    recognition.continuous = false; // 1発言で自動停止
    recognition.interimResults = false; // 確定結果のみ

    recognition.onstart = () => {
      console.log('音声認識開始');
      setIsRecording(true);
    };

    recognition.onresult = (event) => {
      const voiceTranscript = event.results[0][0].transcript;
      console.log('認識結果:', voiceTranscript);
      setTranscript(voiceTranscript);
      
      // 自動分析が有効な場合
      if (autoAnalyze) {
        console.log('自動分析を実行します');
        // 少し待ってから分析 (状態更新を待つ)
        setTimeout(() => {
          // transcript state が更新されるのを待つため、
          // 直接 voiceTranscript を使用
          analyzeTextWithTranscript(voiceTranscript);
        }, 100);
      }
    };

    recognition.onerror = (event) => {
      console.error('音声認識エラー:', event.error);
      setIsRecording(false);
      
      if (event.error === 'not-allowed') {
        alert('マイクの使用が許可されていません。ブラウザの設定を確認してください。');
      } else if (event.error === 'no-speech') {
        alert('音声が検出されませんでした。もう一度お試しください。');
      } else {
        alert('音声認識エラー: ' + event.error);
      }
    };

    recognition.onend = () => {
      console.log('音声認識終了');
      setIsRecording(false);
      setVoiceRecognition(null);
    };

    setVoiceRecognition(recognition);
    recognition.start();
  };
  
  const analyzeText = async () => {
    if (!transcript.trim()) {
      alert('発言を入力してください');
      return;
    }

    setIsAnalyzing(true);

    try {
      // まず仮の履歴を作成
      const tempHistory = [...history, { transcript: transcript }];
      
      // 2発言目の場合、先にテーマ検出
      let detectedTheme = null;
      if (tempHistory.length >= 2 && !theme) {
        console.log('テーマ検出を実行中...');
        detectedTheme = await detectTheme(tempHistory);
        console.log('検出されたテーマ:', detectedTheme);
      }

      // テーマを決定 (検出されたテーマ > 既存のテーマ > デフォルト)
      const currentTheme = detectedTheme?.theme || theme?.theme || 'general';
      console.log('使用するテーマ:', currentTheme);

      // 分析を実行
      const response = await fetch('http://localhost:8080/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          transcript: transcript,
          theme: currentTheme
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        console.log('受信データ:', data.analysis);
        
        let cleanJson = data.analysis;
        cleanJson = cleanJson.replace(/```json\s*/g, '');
        cleanJson = cleanJson.replace(/```\s*/g, '');
        
        const jsonStart = cleanJson.indexOf('{');
        const jsonEnd = cleanJson.lastIndexOf('}');
        
        if (jsonStart !== -1 && jsonEnd !== -1) {
          cleanJson = cleanJson.substring(jsonStart, jsonEnd + 1);
        }
        
        console.log('クリーンアップ後:', cleanJson);
        
        const parsedAnalysis = JSON.parse(cleanJson);
        
        setAnalysis(parsedAnalysis);
        
        const newHistory = [...history, {
          transcript: transcript,
          analysis: parsedAnalysis,
          timestamp: new Date().toLocaleTimeString('ja-JP')
        }];
        setHistory(newHistory);
        
        // ギャップ分析を自動実行 (テーマを渡す)
        const themeForGaps = detectedTheme?.theme || theme?.theme;
        if (themeForGaps && newHistory.length >= 2) {
          console.log('ギャップ分析で使用するテーマ:', themeForGaps);
          analyzeGaps(newHistory, themeForGaps);
        } else {
          console.log('テーマ未確定のため、ギャップ分析をスキップ');
        }
        // トピック分類を実行
        classifyTopics(newHistory);
        
        setTranscript('');
      }
    } catch (error) {
      console.error('Error:', error);
      console.error('エラー詳細:', error.message);
      alert('分析中にエラーが発生しました: ' + error.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 音声入力からの自動分析用 (transcript を直接渡す)
  const analyzeTextWithTranscript = async (textToAnalyze) => {
    if (!textToAnalyze || !textToAnalyze.trim()) {
      return;
    }

    setIsAnalyzing(true);

    try {
      const tempHistory = [...history, { transcript: textToAnalyze }];
      
      let detectedTheme = null;
      if (tempHistory.length >= 2 && !theme) {
        console.log('テーマ検出を実行中...');
        detectedTheme = await detectTheme(tempHistory);
        console.log('検出されたテーマ:', detectedTheme);
      }

      const currentTheme = detectedTheme?.theme || theme?.theme || 'general';
      console.log('使用するテーマ:', currentTheme);

      const response = await fetch('http://localhost:8080/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          transcript: textToAnalyze,
          theme: currentTheme
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        console.log('受信データ:', data.analysis);
        
        let cleanJson = data.analysis;
        cleanJson = cleanJson.replace(/```json\s*/g, '');
        cleanJson = cleanJson.replace(/```\s*/g, '');
        
        const jsonStart = cleanJson.indexOf('{');
        const jsonEnd = cleanJson.lastIndexOf('}');
        
        if (jsonStart !== -1 && jsonEnd !== -1) {
          cleanJson = cleanJson.substring(jsonStart, jsonEnd + 1);
        }
        
        console.log('クリーンアップ後:', cleanJson);
        
        const parsedAnalysis = JSON.parse(cleanJson);
        
        setAnalysis(parsedAnalysis);
        
        const newHistory = [...history, {
          transcript: textToAnalyze,
          analysis: parsedAnalysis,
          timestamp: new Date().toLocaleTimeString('ja-JP')
        }];
        setHistory(newHistory);
        
        const themeForGaps = detectedTheme?.theme || theme?.theme;
        if (themeForGaps && newHistory.length >= 2) {
          console.log('ギャップ分析で使用するテーマ:', themeForGaps);
          analyzeGaps(newHistory, themeForGaps);
        } else {
          console.log('テーマ未確定のため、ギャップ分析をスキップ');
        }
        
        // トピック分類を実行 (3発言以上で)
        classifyTopics(newHistory);
        
        setTranscript(''); // 入力欄をクリア
      }
    } catch (error) {
      console.error('Error:', error);
      console.error('エラー詳細:', error.message);
      alert('分析中にエラーが発生しました: ' + error.message);
    } finally {
      setIsAnalyzing(false);
    }
  };



  const analyzeGaps = async (currentHistory, themeId = null) => {
    console.log('===== analyzeGaps 開始 =====');
    console.log('currentHistory.length:', currentHistory.length);
    console.log('themeId 引数:', themeId);
    console.log('theme state:', theme?.theme);
    
    if (currentHistory.length < 2) {
      console.log('発言数が2未満のため、ギャップ分析をスキップ');
      setGaps(null);
      return;
    }

    const themeToUse = themeId || theme?.theme || 'general';
    console.log('使用するテーマ:', themeToUse);

    try {
      console.log('サーバーに送信するテーマ:', themeToUse);
      
      const response = await fetch('http://localhost:8080/analyze-gaps', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          histories: currentHistory.map(h => ({ transcript: h.transcript })),
          theme: themeToUse
        }),
      });

      const data = await response.json();
      
      console.log('ギャップ分析結果:', data);
      
      if (data.success && data.has_gaps) {
        setGaps(data.analysis);
      } else {
        setGaps(null);
      }
    } catch (error) {
      console.error('Gap analysis error:', error);
    }
  };

  // トピック分類
  const classifyTopics = async (currentHistory) => {
    if (currentHistory.length < 3) {
      setTopicClassification(null);
      return;
    }

    try {
      console.log('トピック分類を実行中...');
      
      const response = await fetch('http://localhost:8080/classify-topics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          histories: currentHistory.map(h => ({ transcript: h.transcript }))
        }),
      });

      const data = await response.json();
      
      console.log('トピック分類結果:', data);
      
      if (data.success) {
        setTopicClassification(data.classification);
      } else {
        setTopicClassification(null);
      }
    } catch (error) {
      console.error('Topic classification error:', error);
      setTopicClassification(null);
    }
  };

  const detectTheme = async (currentHistory) => {
    // 2発言以上で、まだテーマが検出されていない場合
    if (currentHistory.length >= 2 && !theme) {
      try {
        const response = await fetch('http://localhost:8080/detect-theme', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            histories: currentHistory.map(h => ({ transcript: h.transcript || h }))
          }),
        });

        const data = await response.json();
        
        if (data.success) {
          setTheme(data);
          console.log('検出されたテーマ:', data);
          return data;  // ← 検出したテーマを返す
        }
      } catch (error) {
        console.error('Theme detection error:', error);
      }
    }
    return null;  // ← テーマが検出されなかった場合
  };

  const getStanceColor = (stance) => {
    if (stance.includes('賛成')) return '#4CAF50';
    if (stance.includes('反対')) return '#F44336';
    return '#FF9800';
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>🧠 Meeting Mind</h1>
      </header>
      
      <div className="main-content">
        {/* 入力セクション */}
        <div className="input-section">
          <h2>📝 発言を入力してください</h2>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="会議での発言を入力してください..."
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
          />
          
          <div className="voice-options">
            <label className="auto-analyze-option">
              <input 
                type="checkbox" 
                checked={autoAnalyze}
                onChange={(e) => setAutoAnalyze(e.target.checked)}
              />
              <span>音声入力後に自動分析</span>
            </label>
          </div>

          <button 
            onClick={startVoiceInput} 
            className={`voice-button ${isRecording ? 'recording' : ''}`}
            disabled={isAnalyzing}
          >
            {isRecording ? '⏹️ 停止' : '🎤 音声入力'}
          </button>
          
          <button 
            onClick={analyzeText} 
            className="analyze-button"
            disabled={isAnalyzing}
          >
            {isAnalyzing ? '⏳ 分析中...' : '🔍 分析する'}
          </button>
        </div>

        {/* 2カラムレイアウト */}
        <div className="content-grid">
          {/* 左カラム */}
          <div className="left-column">
            {/* 分析結果 */}
            {analysis && (
              <div className="analysis-section">
                <h2>📊 分析結果</h2>
                
                <div className="analysis-item">
                  <strong>トピック:</strong>
                  <p>{analysis.topic}</p>
                </div>

                <div className="analysis-item">
                  <strong>立場:</strong>
                  <span className={`stance-badge stance-${analysis.stance}`}>
                    {analysis.stance}
                  </span>
                </div>

                {analysis.dimensions && theme && history.length >= 2 && (
                  <div className="analysis-item">
                    <strong>📈 多次元分析:</strong>
                    <div className="dimensions">
                      {Object.entries(analysis.dimensions).map(([key, value]) => {
                        const label = theme?.dimensions?.[key] || key;
                        const isNumeric = typeof value === 'number';
                        
                        return (
                          <div className="dimension-row" key={key}>
                            <span className="dimension-label">{label}:</span>
                            {isNumeric ? (
                              <>
                                <div className="dimension-bar">
                                  <div 
                                    className="dimension-fill"
                                    style={{ width: `${value * 10}%` }}
                                  ></div>
                                </div>
                                <span className="dimension-value">{value}</span>
                              </>
                            ) : (
                              <span className="time-horizon">{value}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="analysis-item">
                  <strong>確信度:</strong>
                  <div className="confidence-bar">
                    <div className="confidence-fill">
                      <div 
                        className="confidence-fill-inner"
                        style={{ width: `${analysis.confidence * 10}%` }}
                      ></div>
                    </div>
                    <span>{analysis.confidence}/10</span>
                  </div>
                </div>

                <div className="analysis-item">
                  <strong>要点:</strong>
                  <ul className="key-points-list">
                    {analysis.key_points.map((point, index) => (
                      <li key={index}>{point}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* テーマ検出 */}
            {theme && (
              <div className="theme-section">
                <h2>📋 検出されたテーマ</h2>
                <div className="theme-card">
                  <div className="theme-name">{theme.theme_name}</div>
                  <div className="theme-description">{theme.description}</div>
                  <div className="theme-dimensions">
                    <strong>評価視点:</strong>
                    <div className="dimension-tags">
                      {Object.values(theme.dimensions).map((dim, idx) => (
                        <span key={idx} className="dimension-tag">{dim}</span>
                      ))}
                    </div>
                  </div>
                  <div className="theme-confidence">
                    確信度: {theme.confidence}/10
                  </div>
                </div>
              </div>
            )}

            {/* 不足視点 */}
            {gaps && (
              <div className="gaps-section">
                <h2>⚠️ 議論の不足視点</h2>
                <div className="gaps-card">
                  <h3>📊 議論カバレッジ:</h3>
                  <div className="coverage-bars">
                    {gaps.coverage && Object.entries(gaps.coverage).map(([key, value]) => {
                      const label = theme?.dimensions?.[key] || key;
                      
                      return (
                        <div className="coverage-row" key={key}>
                          <span className="coverage-label">{label}:</span>
                          <div className="coverage-bar">
                            <div 
                              className="coverage-fill"
                              style={{ width: `${value * 10}%` }}
                            ></div>
                          </div>
                          <span className="coverage-value">{value}/10</span>
                        </div>
                      );
                    })}
                  </div>

                  {gaps.missing_perspectives && gaps.missing_perspectives.length > 0 && (
                    <div className="missing-perspectives">
                      <h3>🚨 不足している視点:</h3>
                      {gaps.missing_perspectives.map((perspective, index) => (
                        <span key={index} className="missing-badge">{perspective}</span>
                      ))}
                    </div>
                  )}

                  {gaps.suggestions && gaps.suggestions.length > 0 && (
                    <div className="suggestions">
                      <h3>💡 提案される質問:</h3>
                      <ul className="suggestions-list">
                        {gaps.suggestions.map((suggestion, index) => (
                          <li key={index}>{suggestion}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="balance">
                    <h3>⚖️ 議論の総合バランス:</h3>
                    <div className="balance-bar">
                      <div className="confidence-fill">
                        <div 
                          className="confidence-fill-inner"
                          style={{ width: `${gaps.overall_balance * 10}%` }}
                        ></div>
                      </div>
                      <span>{gaps.overall_balance}/10</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 右カラム */}
          <div className="right-column">
            {/* 発言履歴 */}
            {history.length > 0 && (
              <div className="history-section">
                <h2>📚 発言履歴</h2>
                {history.map((item, index) => (
                  <div key={index} className="history-item">
                    <div className="history-header">
                      <span className="history-time">{item.timestamp}</span>
                      <span className={`stance-badge stance-${item.analysis.stance}`}>
                        {item.analysis.stance}
                      </span>
                    </div>
                    <div className="history-text">"{item.transcript}"</div>
                    <div className="history-topic">トピック: {item.analysis.topic}</div>
                  </div>
                ))}
              </div>
            )}

            {/* マインドマップ */}
            {history.length > 0 && (
              <div className="mindmap-section">
                <h2>🗺️ マインドマップ</h2>
                <MindMap history={history} topicClassification={topicClassification} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;