import os
from flask import Flask, render_template, request, jsonify, send_file
from datetime import datetime, timedelta
import pandas as pd
from pathlib import Path
from io import BytesIO
from dotenv import load_dotenv
import io


load_dotenv()

app = Flask(__name__, static_folder='static', template_folder='templates')

PLAN_PATH = Path(__file__).parent / "ai_plan_klc25.xlsx"

def load_plan():
    """Load course plan from Excel"""
    df = pd.read_excel(PLAN_PATH)
    return df

def schedule_with_logic(df, target_days, pace, completed_modules):
    """Distribute modules across available days intelligently"""
    
    # Filter completed modules
    if completed_modules:
        remaining_df = df[~df.apply(
            lambda row: f"{row['Course']} - {row['Module']}" in completed_modules, 
            axis=1
        )]
    else:
        remaining_df = df.copy()
    
    if remaining_df.empty:
        return []
    
    # Prepare all modules in order
    modules = []
    for _, row in remaining_df.iterrows():
        colab_link = str(row.get("colab_link", "")) if "colab_link" in row else ""
        course = str(row["Course"])
        hours = float(row.get("Hours", 1.0)) if "Hours" in row and pd.notna(row.get("Hours")) else 1.0
        
        modules.append({
            "course": course,
            "module": str(row["Module"]),
            "topics": str(row["Topics"]),
            "colab_link": colab_link,
            "weight": hours
        })
    
    total_modules = len(modules)
    
    print(f"\n📊 Scheduling {total_modules} modules across {target_days} days")
    
    # If we have fewer modules than days, use fewer days
    actual_days_needed = min(total_modules, target_days)
    
    # Calculate distribution
    if total_modules <= actual_days_needed:
        # Fewer or equal modules than days: 1 module per day
        print(f"   Strategy: 1 module per day (have {total_modules} modules)")
        
        schedule = []
        for i, module in enumerate(modules):
            schedule.append({
                "day_number": i + 1,
                "topics": [module]
            })
    
    else:
        # More modules than days: distribute evenly
        base_modules_per_day = total_modules // target_days
        extra_modules = total_modules % target_days
        
        print(f"   Strategy: Base {base_modules_per_day} per day, {extra_modules} days get +1")
        
        # Pace determines where to put extra modules
        if pace == "intensive":
            # Front-load: early days get extras
            days_with_extra = set(range(extra_modules))
        elif pace == "relaxed":
            # Back-load: later days get extras
            days_with_extra = set(range(target_days - extra_modules, target_days))
        else:
            # Balanced: spread evenly
            if extra_modules > 0:
                step = target_days / extra_modules
                days_with_extra = set(int(i * step) for i in range(extra_modules))
            else:
                days_with_extra = set()
        
        # Build schedule
        schedule = []
        module_index = 0
        
        for day_num in range(target_days):
            # Determine modules for this day
            if day_num in days_with_extra:
                modules_today = base_modules_per_day + 1
            else:
                modules_today = base_modules_per_day
            
            # Skip day if no modules left
            if module_index >= total_modules:
                break
            
            # Collect modules for today
            day_modules = []
            for _ in range(modules_today):
                if module_index < total_modules:
                    day_modules.append(modules[module_index])
                    module_index += 1
                else:
                    break
            
            # Only add day if it has modules
            if day_modules:
                schedule.append({
                    "day_number": len(schedule) + 1,
                    "topics": day_modules
                })
    
    # Verify
    actual_days = len(schedule)
    scheduled_modules = sum(len(day["topics"]) for day in schedule)
    modules_per_day = [len(day["topics"]) for day in schedule]
    
    print(f"\nSchedule created:")
    print(f"   Days used: {actual_days}")
    print(f"   Modules scheduled: {scheduled_modules}/{total_modules}")
    print(f"   Distribution: {modules_per_day}")
    
    # Safety check
    if scheduled_modules != total_modules:
        print(f"   ⚠️  WARNING: Module count mismatch!")
        print(f"   Expected: {total_modules}, Got: {scheduled_modules}")
    
    return schedule

def export_to_excel(schedule, start_date, focus_areas, pace):
    """Export schedule to Excel"""
    rows = []
    start = datetime.strptime(start_date, '%Y-%m-%d')
    
    for day in schedule:
        day_num = day["day_number"]
        day_date = start + timedelta(days=day_num - 1)
        
        for topic in day["topics"]:
            rows.append({
                "Day": day_num,
                "Date": day_date.strftime('%Y-%m-%d'),
                "Day of Week": day_date.strftime('%A'),
                "Course": topic["course"],
                "Module": topic["module"],
                "Topics": topic["topics"],
                "Colab Link": topic.get("colab_link", "")
            })
    
    df_export = pd.DataFrame(rows)
    output = BytesIO()
    
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df_export.to_excel(writer, index=False, sheet_name='Study Schedule')
    
    output.seek(0)
    return output

@app.route('/')
def index():
    """Main page"""
    df = load_plan()
    modules = [f"{row['Course']} - {row['Module']}" for _, row in df.iterrows()]
    return render_template('index.html', modules=modules)

@app.route('/generate', methods=['POST'])
def generate():
    """Generate study plan"""
    try:
        data = request.json
        print(f"Received request: {data}")
        
        start_date = data.get('start_date')
        end_date = data.get('end_date')
        pace = data.get('pace', 'balanced')
        completed_modules = data.get('completed_modules', [])
        
        # Calculate days
        start = datetime.strptime(start_date, '%Y-%m-%d')
        end = datetime.strptime(end_date, '%Y-%m-%d')
        days_available = (end - start).days + 1

        
        print(f"Days available: {days_available}")
        
        if days_available < 15:
            return jsonify({'error': 'Minimum 15 days required'}), 400
        
        # Load plan and generate schedule
        df = load_plan()
        schedule = schedule_with_logic(df, days_available, pace, completed_modules)
        
        if not schedule:
            return jsonify({'error': 'No schedule generated'}), 400
        
        # Calculate metrics
        actual_days = len(schedule)
        scheduled_count = sum(len(day['topics']) for day in schedule)
        finish_date = (start + timedelta(days=actual_days - 1)).strftime('%Y-%m-%d')
        buffer_days = days_available - actual_days
        
        print(f"Sending metrics: days={actual_days}, modules={scheduled_count}, buffer={buffer_days}")
        
        return jsonify({
            'success': True,
            'schedule': schedule,
            'metrics': {
                'scheduled_days': actual_days,
                'total_modules': scheduled_count,
                'finish_date': finish_date,
                'buffer_days': buffer_days
            }
        })
        
    except Exception as e:
        print(f"Error in /generate: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/download', methods=['POST'])
def download():
    """Generate downloadable Excel file"""
    try:
        data = request.json
        schedule = data.get('schedule', [])
        start_date = data.get('start_date')
        pace = data.get('pace', 'balanced')
        
        # Create Excel
        rows = []
        for day in schedule:
            date_obj = datetime.strptime(start_date, '%Y-%m-%d') + timedelta(days=day['day_number'] - 1)
            date_str = date_obj.strftime('%Y-%m-%d')
            
            for topic in day['topics']:
                rows.append({
                    'Day': day['day_number'],
                    'Date': date_str,
                    'Course': topic['course'],
                    'Module': topic['module'],
                    'Topics': topic['topics'],
                    'Colab Link': topic.get('colab_link', '')
                })
        
        df = pd.DataFrame(rows)
        
        output = BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Study Plan')
        
        output.seek(0)
        
        return send_file(
            output,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name=f'study_plan_{start_date}_{pace}.xlsx'
        )
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=False, host='0.0.0.0', port=int(os.environ.get('PORT', 8080)))