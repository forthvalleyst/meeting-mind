from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import google.generativeai as genai
import json

# 会議テーマごとの視点セット定義
DIMENSION_SETS = {
    "equipment_investment": {
        "theme_name": "設備投資・設備導入",
        "dimensions": {
            "cost_concern": "コスト重視度",
            "safety_concern": "安全性重視度",
            "efficiency_focus": "効率性重視度",
            "people_focus": "人材育成重視度",
            "time_horizon": "時間軸"
        },
        "description": "設備投資や新規導入の検討に適した視点"
    },
    "hr_evaluation": {
        "theme_name": "人事評価・採用",
        "dimensions": {
            "performance": "成果・実績",
            "skill_development": "能力開発",
            "team_contribution": "チーム貢献",
            "leadership": "リーダーシップ",
            "potential": "将来性"
        },
        "description": "人事評価や採用判断に適した視点"
    },
    "product_development": {
        "theme_name": "新製品開発",
        "dimensions": {
            "market_fit": "市場性",
            "technical_feasibility": "技術実現性",
            "competitive_advantage": "競合優位性",
            "profitability": "収益性",
            "brand_fit": "ブランド適合性"
        },
        "description": "新製品・サービス開発に適した視点"
    },
    "budget_planning": {
        "theme_name": "予算策定・コスト削減",
        "dimensions": {
            "priority": "優先度",
            "roi": "費用対効果",
            "risk": "リスク",
            "feasibility": "実行可能性",
            "strategic_alignment": "戦略整合性"
        },
        "description": "予算や投資判断に適した視点"
    },
    "process_improvement": {
        "theme_name": "業務改善・プロセス改革",
        "dimensions": {
            "efficiency": "効率性",
            "quality": "品質向上",
            "workload": "従業員負担",
            "implementation": "導入難易度",
            "sustainability": "持続可能性"
        },
        "description": "業務プロセスの改善に適した視点"
    },
    "general": {
        "theme_name": "その他 (汎用)",
        "dimensions": {
            "cost_concern": "コスト",
            "quality": "品質",
            "efficiency_focus": "効率性",
            "people_focus": "人材",
            "risk": "リスク"
        },
        "description": "汎用的な評価視点"
    }
}

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})  # ← 明示的にCORS許可

# Gemini API設定
genai.configure(api_key=os.environ.get('GEMINI_API_KEY'))

@app.route('/')
def home():
    return jsonify({
        'message': 'Meeting Mind API',
        'status': 'running'
    })

@app.route('/analyze', methods=['POST'])
def analyze():
    """発言を分析して多次元評価を返す"""
    try:
        data = request.get_json(force=True)
        transcript = data.get('transcript', '')
        theme = data.get('theme', 'equipment_investment')  # テーマを受け取る
        
        # デバッグ用
        print(f"受信したtranscript: {transcript}")
        print(f"受信したテーマ: {theme}")
        print(f"文字数: {len(transcript)}")
        
        # テーマに応じた視点セットを取得
        dimension_set = DIMENSION_SETS.get(theme, DIMENSION_SETS['general'])
        dimensions = dimension_set['dimensions']
        
        print(f"使用する視点セット: {dimension_set['theme_name']}")
        print(f"視点: {list(dimensions.keys())}")
        
        # Gemini で分析
        model = genai.GenerativeModel('gemini-3-flash-preview')
        
        # 動的にプロンプトを構築
        dimension_keys = list(dimensions.keys())
        dimension_descriptions = '\n'.join([f'  "{k}": 0-10,' for k in dimension_keys[:-1]])
        dimension_descriptions += f'\n  "{dimension_keys[-1]}": "短期/中期/長期"' if 'time_horizon' in dimension_keys or 'potential' in dimension_keys else f'\n  "{dimension_keys[-1]}": 0-10'
        
        dimension_labels = '\n'.join([f'- {k}: {v}' for k, v in dimensions.items()])
        
        prompt = f"""
発言を分析してJSON形式で返してください。

発言: {transcript}

評価視点: {dimension_set['theme_name']}
{dimension_labels}

{{
  "topic": "トピック",
  "stance": "賛成/反対/中立/条件付き賛成/条件付き反対",
  "dimensions": {{
{dimension_descriptions}
  }},
  "key_points": ["要点1", "要点2"],
  "confidence": 0-10
}}

ルール: 言及なし=低スコア、必ず要点1つ以上
"""
        
        print("=" * 50)
        print("Geminiに送るプロンプト:")
        print(prompt)
        print("=" * 50)
        
        response = model.generate_content(prompt)
        
        return jsonify({
            'success': True,
            'analysis': response.text,
            'theme_used': theme,
            'dimensions_used': dimensions
        })
        
    except Exception as e:
        print(f"エラー発生: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/detect-theme', methods=['POST'])
def detect_theme():
    """最初の発言からテーマを検出"""
    try:
        data = request.get_json(force=True)
        histories = data.get('histories', [])
        
        print(f"テーマ検出: 発言数 {len(histories)}")
        
        if len(histories) < 1:
            return jsonify({
                'success': False,
                'message': '発言が不足しています'
            }), 400
        
        # 最初の2発言を使用
        sample_texts = [h.get('transcript', '') for h in histories[:2]]
        combined_text = "\n".join(sample_texts)
        
        # Gemini でテーマ検出
        model = genai.GenerativeModel('gemini-3-flash-preview')
        
        prompt = f"""
以下の会議発言から、会議のテーマを判定してください。

発言:
{combined_text}

以下のテーマから最も適切なものを1つ選んでください:
1. equipment_investment (設備投資・設備導入)
2. hr_evaluation (人事評価・採用)
3. product_development (新製品開発)
4. budget_planning (予算策定・コスト削減)
5. process_improvement (業務改善・プロセス改革)
6. general (その他)

以下のJSON形式で返してください:
{{
  "theme": "テーマID (上記から1つ)",
  "confidence": 0-10の数値,
  "reason": "このテーマを選んだ理由"
}}

判断基準:
- 設備、機械、導入などの言及 → equipment_investment
- 人事、評価、採用、人材などの言及 → hr_evaluation
- 製品、開発、新規事業などの言及 → product_development
- 予算、コスト、削減などの言及 → budget_planning
- 業務、プロセス、効率化などの言及 → process_improvement
- 上記に当てはまらない → general
"""
        
        print("=" * 50)
        print("テーマ検出プロンプト:")
        print(prompt)
        print("=" * 50)
        
        response = model.generate_content(prompt)
        
        # JSONを抽出
        cleanJson = response.text
        cleanJson = cleanJson.replace('```json\n', '').replace('```', '')
        jsonStart = cleanJson.find('{')
        jsonEnd = cleanJson.rfind('}')
        if jsonStart != -1 and jsonEnd != -1:
            cleanJson = cleanJson[jsonStart:jsonEnd + 1]
        
        parsedResult = json.loads(cleanJson)
        theme_id = parsedResult.get('theme', 'general')
        
        # 視点セットを取得
        dimension_set = DIMENSION_SETS.get(theme_id, DIMENSION_SETS['general'])
        
        return jsonify({
            'success': True,
            'theme': theme_id,
            'theme_name': dimension_set['theme_name'],
            'dimensions': dimension_set['dimensions'],
            'description': dimension_set['description'],
            'confidence': parsedResult.get('confidence', 5),
            'reason': parsedResult.get('reason', '')
        })
        
    except Exception as e:
        print(f"テーマ検出エラー: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/analyze-gaps', methods=['POST'])
def analyze_gaps():
    """複数の発言から不足している視点を検出 (動的視点対応)"""
    try:
        data = request.get_json(force=True)
        histories = data.get('histories', [])
        theme = data.get('theme', 'general')  # テーマを受け取る
        
        # デバッグ用
        print(f"受信した履歴数: {len(histories)}")
        print(f"使用するテーマ: {theme}")
        print(f"受信したデータ全体: {data}")
        
        # 最低2つの発言が必要
        if len(histories) < 2:
            return jsonify({
                'success': True,
                'has_gaps': False,
                'message': 'まだ発言数が少ないため、分析できません'
            })
        
        # テーマに応じた視点セットを取得
        dimension_set = DIMENSION_SETS.get(theme, DIMENSION_SETS['general'])
        dimensions = dimension_set['dimensions']
        
        print(f"使用する視点セット: {dimension_set['theme_name']}")
        print(f"視点: {list(dimensions.keys())}")
        
        # 履歴を整形
        history_text = "\n".join([
            f"発言{i+1}: {h.get('transcript', '')}"
            for i, h in enumerate(histories)
        ])
        
        # Gemini で不足視点を分析
        model = genai.GenerativeModel('gemini-3-flash-preview')
        
        # 動的にプロンプトを構築
        dimension_list = '\n'.join([f"{i+1}. {key} ({label})" 
                                    for i, (key, label) in enumerate(dimensions.items())])
        
        coverage_format = ',\n    '.join([f'"{key}": 0-10の数値' 
                                          for key in dimensions.keys()])
        
        prompt = f"""
あなたは会議ファシリテーターです。以下の発言履歴を分析して、議論が不足している視点を指摘してください。

【会議テーマ】
{dimension_set['theme_name']}

【これまでの発言】
{history_text}

以下の視点で評価してください:
{dimension_list}

必ず以下のJSON形式で返してください:
{{
  "coverage": {{
    {coverage_format}
  }},
  "missing_perspectives": ["不足している視点1", "不足している視点2"],
  "suggestions": ["具体的な質問提案1", "具体的な質問提案2"],
  "overall_balance": 0-10の数値
}}

ルール:
- coverage: 各視点がどれだけ議論されているか (0=未議論, 10=十分議論)
- missing_perspectives: coverageが3以下の視点をリストアップ (視点名とその説明を含める)
- suggestions: 不足視点について議論を促す具体的な質問
- overall_balance: 議論全体のバランス (0=極端に偏っている, 10=完璧にバランス)
"""
        
        print("=" * 50)
        print("ギャップ分析プロンプト:")
        print(prompt)
        print("=" * 50)
        
        response = model.generate_content(prompt)
        
        # JSONを抽出
        cleanJson = response.text
        cleanJson = cleanJson.replace('```json\n', '').replace('```', '')
        jsonStart = cleanJson.find('{')
        jsonEnd = cleanJson.rfind('}')
        if jsonStart != -1 and jsonEnd != -1:
            cleanJson = cleanJson[jsonStart:jsonEnd + 1]
        
        parsedAnalysis = json.loads(cleanJson)
        
        # 不足視点があるかチェック
        has_gaps = len(parsedAnalysis.get('missing_perspectives', [])) > 0
        
        return jsonify({
            'success': True,
            'has_gaps': has_gaps,
            'analysis': parsedAnalysis,
            'theme_used': theme,
            'dimensions_used': dimensions
        })
        
    except Exception as e:
        print(f"ギャップ分析エラー: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/classify-topics', methods=['POST'])
def classify_topics():
    """発言を主要トピックでグループ化"""
    try:
        data = request.get_json(force=True)
        histories = data.get('histories', [])
        
        print(f"トピック分類: 発言数 {len(histories)}")
        
        if len(histories) < 3:
            return jsonify({
                'success': False,
                'message': '発言数が少ないため、トピック分類できません'
            })
        
        # 発言リストを整形
        speeches_text = "\n".join([
            f"{i+1}. {h.get('transcript', '')}"
            for i, h in enumerate(histories)
        ])
        
        # Gemini でトピック分類
        model = genai.GenerativeModel('gemini-3-flash-preview')
        
        prompt = f"""
以下の会議発言を、3-5個の主要トピックにグループ化してください。

【発言一覧】
{speeches_text}

各発言の内容を分析し、意味的に関連する発言を同じトピックにまとめてください。
トピック名は具体的で分かりやすいものにしてください（例: マネジメント、業績評価、人材育成など）。

以下のJSON形式で返してください:
{{
  "topics": [
    {{
      "name": "トピック名",
      "description": "このトピックの簡潔な説明",
      "speech_indices": [0, 2, 5]
    }},
    {{
      "name": "別のトピック名",
      "description": "説明",
      "speech_indices": [1, 3]
    }}
  ]
}}

ルール:
- トピック数は3-5個
- 全ての発言を必ずどこかのトピックに含める
- speech_indices は0から始まる発言番号の配列
- 似た内容の発言は同じトピックにまとめる
"""
        
        print("=" * 50)
        print("トピック分類プロンプト:")
        print(prompt)
        print("=" * 50)
        
        response = model.generate_content(prompt)
        
        # JSONを抽出
        cleanJson = response.text
        cleanJson = cleanJson.replace('```json\n', '').replace('```', '')
        jsonStart = cleanJson.find('{')
        jsonEnd = cleanJson.rfind('}')
        if jsonStart != -1 and jsonEnd != -1:
            cleanJson = cleanJson[jsonStart:jsonEnd + 1]
        
        parsedResult = json.loads(cleanJson)
        
        print("トピック分類結果:")
        print(json.dumps(parsedResult, ensure_ascii=False, indent=2))
        
        return jsonify({
            'success': True,
            'classification': parsedResult
        })
        
    except Exception as e:
        print(f"トピック分類エラー: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/health', methods=['GET'])
def health():
    """ヘルスチェック"""
    return jsonify({'status': 'healthy'})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=True)