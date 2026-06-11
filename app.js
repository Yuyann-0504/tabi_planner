/**
 * 旅行資金調達バイトシミュレーター - ロジック & UI制御
 * 基準日: 2026-06-10
 */

// 基準日の設定（2026年6月10日）
const BASE_DATE = new Date('2026-06-10T00:00:00');

// ローカル時間での YYYY-MM-DD フォーマット関数
function formatDateLocal(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// 予定データの保持 { 'YYYY-MM-DD': [ { id: 123, title: '...', start: 'HH:MM', end: 'HH:MM' }, ... ] }
let userSchedules = {};

// シフト提案が生成されたかどうかのフラグ
let isShiftProposed = false;

// カレンダー表示中の年月
let currentCalendarYear = 2026;
let currentCalendarMonth = 5; // 0-indexed (6月は5)

let savingsChart = null;

document.addEventListener('DOMContentLoaded', () => {
    // フォーム要素の取得
    const form = document.getElementById('simulator-form');
    const targetAmountInput = document.getElementById('target_amount');
    const currentSavingsInput = document.getElementById('current_savings');
    
    // 期限入力タイプ切り替え
    const deadlineTypeRadios = document.getElementsByName('deadline_type');
    const deadlineDateGroup = document.getElementById('deadline-date-group');
    const deadlinePeriodGroup = document.getElementById('deadline-period-group');
    
    const deadlineDateInput = document.getElementById('deadline_date');
    const deadlinePeriodInput = document.getElementById('deadline_period');
    const deadlineUnitSelect = document.getElementById('deadline_unit');
    
    // バイト1
    const hourlyWage1Input = document.getElementById('hourly_wage_1');
    const avgHours1Input = document.getElementById('avg_hours_per_shift_1');
    const startTimeLimit1Input = document.getElementById('start_time_limit_1');
    const endTimeLimit1Input = document.getElementById('end_time_limit_1');
    
    // プレミアム（有料版）トグル
    const premiumToggle = document.getElementById('premium_toggle');
    const premiumSection = document.getElementById('premium-section');
    
    // バイト2 (プレミアム)
    const hourlyWage2Input = document.getElementById('hourly_wage_2');
    const avgHours2Input = document.getElementById('avg_hours_per_shift_2');
    const startTimeLimit2Input = document.getElementById('start_time_limit_2');
    const endTimeLimit2Input = document.getElementById('end_time_limit_2');
    const jobRatioInput = document.getElementById('job_ratio');
    const jobRatioValue = document.getElementById('job_ratio_value');
    
    // モーダル要素
    const modal = document.getElementById('schedule-modal');
    const modalForm = document.getElementById('modal-form');
    const modalTitleInput = document.getElementById('modal-schedule-title');
    const modalStartTimeInput = document.getElementById('modal-start-time');
    const modalEndTimeInput = document.getElementById('modal-end-time');
    const modalDateVal = document.getElementById('modal-date-val');
    const modalDateTitle = document.getElementById('modal-date-title');
    const schedulesListContainer = document.getElementById('modal-schedules-list');
    const closeModalBtn = document.getElementById('close-modal-btn');
    
    // 初期設定: 本日の日付を基準日の翌月あたりにしておく（デフォルト3ヶ月後くらい）
    const defaultDeadline = new Date(BASE_DATE);
    defaultDeadline.setMonth(defaultDeadline.getMonth() + 3);
    deadlineDateInput.value = formatDateLocal(defaultDeadline);
    
    // イベントリスナーの設定
    deadlineTypeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.value === 'date') {
                deadlineDateGroup.classList.remove('hidden');
                deadlinePeriodGroup.classList.add('hidden');
            } else {
                deadlineDateGroup.classList.add('hidden');
                deadlinePeriodGroup.classList.remove('hidden');
            }
            isShiftProposed = false; // パラメータ変更でリセット
            calculateAndRender();
        });
    });

    premiumToggle.addEventListener('change', (e) => {
        if (e.target.checked) {
            premiumSection.classList.remove('hidden');
        } else {
            premiumSection.classList.add('hidden');
        }
        isShiftProposed = false; // パラメータ変更でリセット
        calculateAndRender();
    });

    jobRatioInput.addEventListener('input', (e) => {
        const val = e.target.value;
        jobRatioValue.textContent = `バイト1 ${10 - val} : バイト2 ${val}`;
        isShiftProposed = false; // パラメータ変更でリセット
        calculateAndRender();
    });

    // すべての入力値の変更でリアルタイム計算
    const inputs = [
        targetAmountInput, currentSavingsInput, deadlineDateInput,
        deadlinePeriodInput, deadlineUnitSelect, hourlyWage1Input,
        avgHours1Input, startTimeLimit1Input, endTimeLimit1Input,
        hourlyWage2Input, avgHours2Input, startTimeLimit2Input, endTimeLimit2Input
    ];
    inputs.forEach(input => {
        input.addEventListener('input', () => {
            isShiftProposed = false; // パラメータ変更でリセット
            calculateAndRender();
        });
        input.addEventListener('change', () => {
            isShiftProposed = false; // パラメータ変更でリセット
            calculateAndRender();
        });
    });

    // --- モーダル制御 ---
    closeModalBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.add('hidden');
        }
    });

    // 予定の追加処理
    modalForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const dateStr = modalDateVal.value;
        const newSched = {
            id: Date.now(),
            title: modalTitleInput.value,
            start: modalStartTimeInput.value,
            end: modalEndTimeInput.value
        };

        if (!userSchedules[dateStr]) {
            userSchedules[dateStr] = [];
        }
        userSchedules[dateStr].push(newSched);

        // フォームのリセット
        modalTitleInput.value = '';
        modalStartTimeInput.value = '10:00';
        modalEndTimeInput.value = '15:00';

        // モーダル内の一覧を再描画 & 全体再計算
        renderModalSchedulesList(dateStr);
        calculateAndRender();
    });

    // 予定の個別削除処理（イベントデリゲーション）
    schedulesListContainer.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.modal-delete-sched-btn');
        if (deleteBtn) {
            const dateStr = modalDateVal.value;
            const id = parseInt(deleteBtn.getAttribute('data-id'));
            
            if (userSchedules[dateStr]) {
                userSchedules[dateStr] = userSchedules[dateStr].filter(sched => sched.id !== id);
                if (userSchedules[dateStr].length === 0) {
                    delete userSchedules[dateStr];
                }
            }
            
            renderModalSchedulesList(dateStr);
            calculateAndRender();
        }
    });

    // 初回計算
    calculateAndRender();
});

/**
 * 期間（週数・月数）の計算
 * @returns {Object|null} { weeks, months, days, label, deadlineDate }
 */
function calculateDuration() {
    const deadlineType = document.querySelector('input[name="deadline_type"]:checked').value;
    
    if (deadlineType === 'date') {
        const dateVal = document.getElementById('deadline_date').value;
        if (!dateVal) return null;
        
        const targetDate = new Date(dateVal + 'T00:00:00');
        const diffTime = targetDate.getTime() - BASE_DATE.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays <= 0) {
            return { error: '期限は本日（2026年6月10日）より後の日付を指定してください。' };
        }
        
        const weeks = diffDays / 7;
        const months = diffDays / 30.4375;
        
        return {
            weeks: weeks,
            months: months,
            days: diffDays,
            label: `${targetDate.getFullYear()}年${targetDate.getMonth() + 1}月${targetDate.getDate()}日 (${diffDays}日後)`,
            deadlineDate: targetDate
        };
    } else {
        const periodVal = parseFloat(document.getElementById('deadline_period').value);
        const unit = document.getElementById('deadline_unit').value;
        
        if (isNaN(periodVal) || periodVal <= 0) return null;
        
        let weeks, months, days;
        let label = '';
        const deadlineDate = new Date(BASE_DATE);
        
        if (unit === 'month') {
            months = periodVal;
            weeks = periodVal * 4.3452;
            days = Math.round(periodVal * 30.4375);
            label = `${periodVal}か月後`;
            deadlineDate.setDate(deadlineDate.getDate() + days);
        } else {
            weeks = periodVal;
            months = periodVal / 4.3452;
            days = periodVal * 7;
            label = `${periodVal}週間後`;
            deadlineDate.setDate(deadlineDate.getDate() + days);
        }
        
        return {
            weeks: weeks,
            months: months,
            days: days,
            label: label,
            deadlineDate: deadlineDate
        };
    }
}

/**
 * 予定とバイト稼働可能時間枠を考慮し、バイト可能時間を算出する
 * @param {string} dateStr - 'YYYY-MM-DD'
 * @param {number} requiredHours - バイトに必要な連続時間 (時間単位)
 * @param {string} startLimitStr - 稼働可能開始時刻 'HH:MM'
 * @param {string} endLimitStr - 稼働可能終了時刻 'HH:MM'
 * @returns {Array<Object>|null} 可能なシフト枠の配列 [{ start: 'HH:MM', end: 'HH:MM' }]
 */
function getAvailableShiftSlots(dateStr, requiredHours, startLimitStr, endLimitStr) {
    const [limitSH, limitSM] = startLimitStr.split(':').map(Number);
    const [limitEH, limitEM] = endLimitStr.split(':').map(Number);
    
    const defaultStart = limitSH * 60 + limitSM;
    const defaultEnd = limitEH * 60 + limitEM;
    const reqMin = requiredHours * 60;
    
    const schedules = userSchedules[dateStr];
    if (!schedules || schedules.length === 0) {
        // 予定がない場合は稼働可能時間まるごと空き
        return defaultEnd - defaultStart >= reqMin ? [{ start: startLimitStr, end: endLimitStr }] : null;
    }
    
    // 予定を開始時間順にソート
    const sortedScheds = [...schedules].sort((a, b) => {
        const [aH, aM] = a.start.split(':').map(Number);
        const [bH, bM] = b.start.split(':').map(Number);
        return (aH * 60 + aM) - (bH * 60 + bM);
    });
    
    const slots = [];
    let currentPointer = defaultStart;
    
    for (const sched of sortedScheds) {
        const [sH, sM] = sched.start.split(':').map(Number);
        const [eH, eM] = sched.end.split(':').map(Number);
        const schedStart = sH * 60 + sM;
        const schedEnd = eH * 60 + eM;
        
        // 予定が稼働可能時間枠の外（前）にある場合、スルー
        if (schedEnd <= defaultStart) {
            continue;
        }
        // 予定が稼働可能時間枠の外（後）にある場合、そこで探索を打ち切る
        if (schedStart >= defaultEnd) {
            break;
        }
        
        // 稼働可能範囲内での予定前の空き時間を判定
        const actualStart = Math.max(currentPointer, defaultStart);
        const actualEnd = Math.min(schedStart, defaultEnd);
        
        if (actualEnd - actualStart >= reqMin) {
            slots.push({
                start: minutesToTimeStr(actualStart),
                end: minutesToTimeStr(actualEnd)
            });
        }
        
        // ポインタを予定終了時間のうち、より遅いほうに更新
        if (schedEnd > currentPointer) {
            currentPointer = schedEnd;
        }
    }
    
    // 最後の予定終了からバイト終了時間までの空き時間チェック
    const actualStart = Math.max(currentPointer, defaultStart);
    if (defaultEnd - actualStart >= reqMin) {
        slots.push({
            start: minutesToTimeStr(actualStart),
            end: minutesToTimeStr(defaultEnd)
        });
    }
    
    return slots.length > 0 ? slots : null;
}

function minutesToTimeStr(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * 期限までの全日程に対するシフトの自動マッピング
 */
function autoAllocateMonthlyShifts(shiftsCount1, shiftsCount2, hours1, hours2, deadlineDate, limitStart1, limitEnd1, limitStart2, limitEnd2) {
    const assignments = {};
    const needed1 = Math.ceil(shiftsCount1);
    const needed2 = Math.ceil(shiftsCount2);
    const totalNeeded = needed1 + needed2;
    
    const queue = [];
    const maxLen = Math.max(needed1, needed2);
    for (let i = 0; i < maxLen; i++) {
        if (i < needed1) queue.push({ job: 'job1', hours: hours1, startLimit: limitStart1, endLimit: limitEnd1 });
        if (i < needed2) queue.push({ job: 'job2', hours: hours2, startLimit: limitStart2, endLimit: limitEnd2 });
    }
    
    const datesList = [];
    let d = new Date(BASE_DATE);
    while (d < deadlineDate) {
        datesList.push(new Date(d));
        d.setDate(d.getDate() + 1);
    }
    
    let assignedCount = 0;
    
    for (const date of datesList) {
        if (queue.length === 0) break;
        
        const dateStr = formatDateLocal(date);
        const nextJob = queue[0];
        
        const availableSlots = getAvailableShiftSlots(dateStr, nextJob.hours, nextJob.startLimit, nextJob.endLimit);
        
        if (availableSlots && availableSlots.length > 0) {
            const slot = availableSlots[0];
            const [sH, sM] = slot.start.split(':').map(Number);
            const startMin = sH * 60 + sM;
            const endMin = startMin + (nextJob.hours * 60);
            
            assignments[dateStr] = {
                type: nextJob.job,
                start: slot.start,
                end: minutesToTimeStr(endMin)
            };
            
            queue.shift();
            assignedCount++;
        }
    }
    
    let warning = null;
    if (queue.length > 0) {
        const missing = queue.length;
        warning = `⚠️ 設定された可能時間帯や予定を避けてバイトを入れるための空き時間が不足しています。目標達成には計 ${totalNeeded}回のシフトが必要ですが、現在は ${assignedCount}回しか配置できませんでした。あと ${missing}回分、カレンダーの日付をクリックして予定時間を調整するか、バイトの「勤務可能時間帯」を広げてください。`;
    }
    
    return { assignments, assignedCount, totalNeeded, warning };
}

/**
 * 月間カレンダーHTMLの生成
 */
function renderMonthlyCalendar(year, month, assignments) {
    const monthNames = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const prevLastDay = new Date(year, month, 0);
    
    const startingDay = firstDay.getDay();
    const totalDays = lastDay.getDate();
    const prevTotalDays = prevLastDay.getDate();
    
    const proposeBtnHtml = isShiftProposed
        ? `<button type="button" id="propose-shifts-btn" class="propose-btn active">🔄 シフト提案を再計算</button>`
        : `<button type="button" id="propose-shifts-btn" class="propose-btn highlight-propose">🎯 目標達成のためのシフト提案を生成</button>`;
    
    let calendarHtml = `
        <div class="calendar-header-controls">
            <button type="button" id="prev-month-btn" class="month-nav-btn">&lt; 前月</button>
            <h3 class="calendar-month-title">${year}年 ${monthNames[month]}</h3>
            <button type="button" id="next-month-btn" class="month-nav-btn">翌月 &gt;</button>
        </div>
        <div class="calendar-action-bar">
            ${proposeBtnHtml}
        </div>
        <div class="calendar-month-grid">
            <div class="month-weekday-header">日</div>
            <div class="month-weekday-header">月</div>
            <div class="month-weekday-header">火</div>
            <div class="month-weekday-header">水</div>
            <div class="month-weekday-header">木</div>
            <div class="month-weekday-header">金</div>
            <div class="month-weekday-header">土</div>
    `;
    
    let dayCount = 1;
    
    for (let i = 0; i < startingDay; i++) {
        const prevDay = prevTotalDays - startingDay + i + 1;
        calendarHtml += `<div class="month-day-cell prev-month">${prevDay}</div>`;
    }
    
    for (let i = startingDay; i < 42; i++) {
        if (dayCount > totalDays) {
            const nextDay = dayCount - totalDays;
            calendarHtml += `<div class="month-day-cell next-month">${nextDay}</div>`;
            dayCount++;
            continue;
        }
        
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayCount).padStart(2, '0')}`;
        const isToday = (year === 2026 && month === 5 && dayCount === 10);
        
        // 複数予定の描画
        const scheds = userSchedules[dateStr] || [];
        let schedsHtml = '';
        if (scheds.length > 0) {
            const sorted = [...scheds].sort((a, b) => a.start.localeCompare(b.start));
            schedsHtml = sorted.map(sched => 
                `<div class="cell-event sched-item" title="${sched.title}">🛑 ${sched.start}-${sched.end} ${sched.title}</div>`
            ).join('');
        }
        
        // 提案シフト
        const assign = assignments[dateStr];
        let assignHtml = '';
        if (isShiftProposed && assign) {
            const badgeClass = assign.type === 'job1' ? 'assigned-job1' : 'assigned-job2';
            const label = assign.type === 'job1' ? 'バイト1' : 'バイト2';
            assignHtml = `<div class="cell-event ${badgeClass}">💼 ${assign.start}-${assign.end} ${label}</div>`;
        }
        
        const cellClass = `month-day-cell current-month ${isToday ? 'today' : ''} ${scheds.length > 0 ? 'has-sched' : ''}`;
        
        calendarHtml += `
            <div class="month-day-cell ${cellClass}" data-date="${dateStr}">
                <span class="cell-day-num">${dayCount}</span>
                <div class="cell-events-container">
                    ${schedsHtml}
                    ${assignHtml}
                </div>
            </div>
        `;
        
        dayCount++;
    }
    
    calendarHtml += `</div>`;
    return calendarHtml;
}

/**
 * イベントのバインド
 */
function bindCalendarEvents(assignments) {
    const prevBtn = document.getElementById('prev-month-btn');
    const nextBtn = document.getElementById('next-month-btn');
    const proposeBtn = document.getElementById('propose-shifts-btn');
    
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            currentCalendarMonth--;
            if (currentCalendarMonth < 0) {
                currentCalendarMonth = 11;
                currentCalendarYear--;
            }
            calculateAndRender();
        });
    }
    
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            currentCalendarMonth++;
            if (currentCalendarMonth > 11) {
                currentCalendarMonth = 0;
                currentCalendarYear++;
            }
            calculateAndRender();
        });
    }
    
    if (proposeBtn) {
        proposeBtn.addEventListener('click', () => {
            isShiftProposed = true;
            calculateAndRender();
        });
    }
    
    document.querySelectorAll('.month-day-cell.current-month').forEach(cell => {
        cell.addEventListener('click', () => {
            const dateStr = cell.getAttribute('data-date');
            openScheduleModal(dateStr);
        });
    });
}

/**
 * モーダルを開いて予定リストを描画する
 */
function openScheduleModal(dateStr) {
    const modal = document.getElementById('schedule-modal');
    const modalDateVal = document.getElementById('modal-date-val');
    const modalDateTitle = document.getElementById('modal-date-title');
    const modalTitleInput = document.getElementById('modal-schedule-title');
    
    const [y, m, d] = dateStr.split('-').map(Number);
    modalDateTitle.textContent = `${y}年${m}月${d}日の予定設定`;
    modalDateVal.value = dateStr;
    
    modalTitleInput.value = '';
    document.getElementById('modal-start-time').value = '10:00';
    document.getElementById('modal-end-time').value = '15:00';
    
    renderModalSchedulesList(dateStr);
    
    modal.classList.remove('hidden');
}

/**
 * モーダル内の登録済み予定リストを描画
 */
function renderModalSchedulesList(dateStr) {
    const container = document.getElementById('modal-schedules-list');
    const schedules = userSchedules[dateStr] || [];
    
    if (schedules.length === 0) {
        container.innerHTML = `<p class="empty-list-msg">登録された予定はありません。</p>`;
        return;
    }
    
    const sorted = [...schedules].sort((a, b) => a.start.localeCompare(b.start));
    
    let html = '<ul class="modal-schedules-ul">';
    sorted.forEach(sched => {
        html += `
            <li class="modal-schedule-li">
                <div class="modal-sched-info">
                    <strong class="modal-sched-title">${sched.title}</strong>
                    <span class="modal-sched-time">⏰ ${sched.start} 〜 ${sched.end}</span>
                </div>
                <button type="button" class="modal-delete-sched-btn" data-id="${sched.id}" title="この予定を削除">&times;</button>
            </li>
        `;
    });
    html += '</ul>';
    
    container.innerHTML = html;
}

/**
 * シミュレーション計算とUIへの描画
 */
function calculateAndRender() {
    const targetAmount = parseInt(document.getElementById('target_amount').value) || 0;
    const currentSavings = parseInt(document.getElementById('current_savings').value) || 0;
    
    const duration = calculateDuration();
    const roadmapContainer = document.getElementById('roadmap-result');
    
    if (!duration) {
        roadmapContainer.innerHTML = '<div class="alert alert-info">目標と期限を入力してください。</div>';
        return;
    }
    if (duration.error) {
        roadmapContainer.innerHTML = `<div class="alert alert-warning">${duration.error}</div>`;
        return;
    }
    
    const neededAmount = targetAmount - currentSavings;
    if (neededAmount <= 0) {
        roadmapContainer.innerHTML = `
            <div class="alert alert-success">
                <h4>🎉 目標達成！</h4>
                <p>現在の貯金額が目標金額に達しています。素晴らしい！</p>
            </div>
        `;
        updateChart([0], [currentSavings], [0]);
        return;
    }

    const isPremium = document.getElementById('premium_toggle').checked;
    const wage1 = parseInt(document.getElementById('hourly_wage_1').value) || 0;
    const hours1 = parseFloat(document.getElementById('avg_hours_per_shift_1').value) || 0;
    
    // バイト1の制限時間
    const limitStart1 = document.getElementById('start_time_limit_1').value || '09:00';
    const limitEnd1 = document.getElementById('end_time_limit_1').value || '22:00';
    
    if (wage1 <= 0 || hours1 <= 0) {
        roadmapContainer.innerHTML = '<div class="alert alert-info">時給と1回あたりの勤務時間を正しく入力してください。</div>';
        return;
    }

    let resultHtml = '';
    let chartData = {};
    let allocateResult = null;

    if (!isPremium) {
        const totalHoursNeeded = neededAmount / wage1;
        const totalShiftsNeeded = totalHoursNeeded / hours1;
        
        const monthlyIncomeNeeded = neededAmount / duration.months;
        const weeklyIncomeNeeded = neededAmount / duration.weeks;
        const shiftsPerWeek = weeklyIncomeNeeded / (wage1 * hours1);
        
        const formattedNeededAmount = neededAmount.toLocaleString();
        const formattedTotalShifts = Math.ceil(totalShiftsNeeded);
        const formattedTotalHours = Math.ceil(totalHoursNeeded);
        const formattedMonthlyIncome = Math.round(monthlyIncomeNeeded).toLocaleString();
        const formattedWeeklyIncome = Math.round(weeklyIncomeNeeded).toLocaleString();
        const formattedShiftsPerWeek = shiftsPerWeek.toFixed(1);

        allocateResult = autoAllocateMonthlyShifts(
            totalShiftsNeeded, 0, hours1, 0, duration.deadlineDate,
            limitStart1, limitEnd1, '18:00', '23:00'
        );
        
        const warningHtml = (isShiftProposed && allocateResult.warning) 
            ? `<div class="schedule-warning">${allocateResult.warning}</div>` 
            : '';
        const calendarHtml = renderMonthlyCalendar(currentCalendarYear, currentCalendarMonth, allocateResult.assignments);

        resultHtml = `
<div class="roadmap-card">
    <div class="roadmap-header">
        <h3>📊 旅行資金の達成ロードマップ</h3>
        <span class="badge badge-primary">通常プラン</span>
    </div>
    
    <div class="section-group">
        <h4>【全体の目標】</h4>
        <ul>
            <li>旅行までにあと稼ぐ金額：<strong>${formattedNeededAmount}</strong> 円</li>
            <li>必要となる総シフト回数：約 <strong>${formattedTotalShifts}</strong> 回 （総労働時間：<strong>${formattedTotalHours}</strong> 時間）</li>
        </ul>
    </div>

    <div class="section-group">
        <h4>【稼ぎ方のペース（ノルマ）】</h4>
        <ul>
            <li>毎月必要な収入：<strong>${formattedMonthlyIncome}</strong> 円</li>
            <li>毎週必要な収入：<strong>${formattedWeeklyIncome}</strong> 円</li>
        </ul>
    </div>

    <div class="section-group highlight-box">
        <h4>【具体的なシフト提案】</h4>
        <p>週に <strong class="highlight-text">${formattedShiftsPerWeek} 回</strong> （1回あたり <strong>${hours1}</strong> 時間）シフトに入れば達成可能です！</p>
    </div>

    <!-- 月間スケジュール提案カレンダー -->
    <div class="section-group schedule-proposal-box">
        <h4>📅 おすすめバイトカレンダー</h4>
        <p class="calendar-desc">※カレンダーの日付をクリックして、先に授業や予定を入力します。その後「シフト提案を生成」ボタンを押すと、予定を避けた空き時間にシフトがアドバイスされます。</p>
        ${warningHtml}
        ${calendarHtml}
    </div>
</div>
        `;

        chartData = generateChartData(duration.weeks, currentSavings, targetAmount, [
            { wage: wage1, hours: hours1, shiftsPerWeek: shiftsPerWeek, name: 'バイト1' }
        ]);

    } else {
        const wage2 = parseInt(document.getElementById('hourly_wage_2').value) || 0;
        const hours2 = parseFloat(document.getElementById('avg_hours_per_shift_2').value) || 0;
        
        // バイト2の制限時間
        const limitStart2 = document.getElementById('start_time_limit_2').value || '18:00';
        const limitEnd2 = document.getElementById('end_time_limit_2').value || '23:00';
        
        if (wage2 <= 0 || hours2 <= 0) {
            roadmapContainer.innerHTML = '<div class="alert alert-info">バイト2の時給と勤務時間も正しく入力してください。</div>';
            return;
        }

        const ratioVal = parseInt(document.getElementById('job_ratio').value);
        const ratio2 = ratioVal / 10;
        const ratio1 = 1 - ratio2;

        const neededAmount1 = neededAmount * ratio1;
        const neededAmount2 = neededAmount * ratio2;

        const hours1Needed = neededAmount1 / wage1;
        const shifts1Needed = hours1Needed / hours1;
        
        const hours2Needed = neededAmount2 / wage2;
        const shifts2Needed = hours2Needed / hours2;

        const weeklyIncome1 = neededAmount1 / duration.weeks;
        const weeklyIncome2 = neededAmount2 / duration.weeks;
        const monthlyIncome1 = neededAmount1 / duration.months;
        const monthlyIncome2 = neededAmount2 / duration.months;

        const shiftsPerWeek1 = weeklyIncome1 / (wage1 * hours1);
        const shiftsPerWeek2 = weeklyIncome2 / (wage2 * hours2);

        const totalHours = hours1Needed + hours2Needed;
        const totalShifts = shifts1Needed + shifts2Needed;
        const monthlyIncome = monthlyIncome1 + monthlyIncome2;
        const weeklyIncome = weeklyIncome1 + weeklyIncome2;

        const formattedNeededAmount = neededAmount.toLocaleString();
        const formattedTotalShifts = Math.ceil(totalShifts);
        const formattedTotalHours = Math.ceil(totalHours);
        const formattedMonthlyIncome = Math.round(monthlyIncome).toLocaleString();
        const formattedWeeklyIncome = Math.round(weeklyIncome).toLocaleString();
        const formattedShiftsPerWeek1 = shiftsPerWeek1.toFixed(1);
        const formattedShiftsPerWeek2 = shiftsPerWeek2.toFixed(1);

        allocateResult = autoAllocateMonthlyShifts(
            shifts1Needed, shifts2Needed, hours1, hours2, duration.deadlineDate,
            limitStart1, limitEnd1, limitStart2, limitEnd2
        );
        
        const warningHtml = (isShiftProposed && allocateResult.warning) 
            ? `<div class="schedule-warning">${allocateResult.warning}</div>` 
            : '';
        const calendarHtml = renderMonthlyCalendar(currentCalendarYear, currentCalendarMonth, allocateResult.assignments);

        resultHtml = `
<div class="roadmap-card premium-card">
    <div class="roadmap-header">
        <h3>📊 旅行資金の達成ロードマップ</h3>
        <span class="badge badge-premium">✨ プレミアム掛け持ちプラン</span>
    </div>
    
    <div class="section-group">
        <h4>【全体の目標】</h4>
        <ul>
            <li>旅行までにあと稼ぐ金額：<strong>${formattedNeededAmount}</strong> 円</li>
            <li>必要となる総シフト回数：計 約 <strong>${formattedTotalShifts}</strong> 回 （総労働時間：<strong>${formattedTotalHours}</strong> 時間）</li>
        </ul>
    </div>

    <div class="section-group">
        <h4>【稼ぎ方のペース（ノルマ）】</h4>
        <ul>
            <li>毎月必要な収入：<strong>${formattedMonthlyIncome}</strong> 円</li>
            <li>毎週必要な収入：<strong>${formattedWeeklyIncome}</strong> 円</li>
        </ul>
        <div class="ratio-breakdown">
            <small>（内訳 - バイト1: 毎月 ${Math.round(monthlyIncome1).toLocaleString()}円 / バイト2: 毎月 ${Math.round(monthlyIncome2).toLocaleString()}円）</small>
        </div>
    </div>

    <div class="section-group highlight-box premium-highlight">
        <h4>【具体的なシフト提案（掛け持ち）】</h4>
        <div class="job-proposal">
            <div class="job-item">
                <span class="job-badge j1">バイト1 (比率 ${Math.round(ratio1*100)}%)</span>
                <p>週に <strong class="highlight-text-blue">${formattedShiftsPerWeek1} 回</strong> （1回 ${hours1}時間）</p>
            </div>
            <div class="job-item">
                <span class="job-badge j2">バイト2 (比率 ${Math.round(ratio2*100)}%)</span>
                <p>週に <strong class="highlight-text-purple">${formattedShiftsPerWeek2} 回</strong> （1回 ${hours2}時間）</p>
            </div>
        </div>
        <p class="summary-note">※2つのバイトを掛け持つことで、それぞれの負担を分散して達成できます！</p>
    </div>

    <!-- 月間スケジュール提案カレンダー -->
    <div class="section-group schedule-proposal-box">
        <h4>📅 おすすめバイトカレンダー</h4>
        <p class="calendar-desc">※カレンダーの日付をクリックして、先に授業や予定を入力します。その後「シフト提案を生成」ボタンを押すと、予定を避けた空き時間にシフトがアドバイスされます。</p>
        ${warningHtml}
        ${calendarHtml}
    </div>
</div>
        `;

        chartData = generateChartData(duration.weeks, currentSavings, targetAmount, [
            { wage: wage1, hours: hours1, shiftsPerWeek: shiftsPerWeek1, name: 'バイト1' },
            { wage: wage2, hours: hours2, shiftsPerWeek: shiftsPerWeek2, name: 'バイト2' }
        ]);
    }

    roadmapContainer.innerHTML = resultHtml;

    if (allocateResult) {
        bindCalendarEvents(allocateResult.assignments);
    }

    if (chartData.labels && chartData.savings1) {
        updateChart(chartData.labels, chartData.savings1, chartData.savings2 || null, targetAmount);
    }
}

/**
 * グラフ描画用の週次データ生成
 */
function generateChartData(weeks, initialSavings, targetAmount, jobs) {
    const totalWeeks = Math.ceil(weeks);
    const labels = [];
    const savings1 = [];
    const savings2 = [];
    
    let weeklyEarn1 = 0;
    let weeklyEarn2 = 0;

    jobs.forEach(job => {
        const earnPerWeek = (job.wage * job.hours * job.shiftsPerWeek);
        if (job.name === 'バイト1') {
            weeklyEarn1 = earnPerWeek;
        } else {
            weeklyEarn2 = earnPerWeek;
        }
    });

    for (let i = 0; i <= totalWeeks; i++) {
        labels.push(`第 ${i} 週`);
        const totalEarned1 = weeklyEarn1 * i;
        const totalEarned2 = weeklyEarn2 * i;
        
        savings1.push(initialSavings + totalEarned1);
        savings2.push(initialSavings + totalEarned1 + totalEarned2);
    }

    return {
        labels,
        savings1,
        savings2: jobs.length > 1 ? savings2 : null
    };
}

/**
 * Chart.jsを用いたグラフの描画・更新
 */
function updateChart(labels, savings1, savings2, targetAmount) {
    const ctx = document.getElementById('savingsChart').getContext('2d');
    if (savingsChart) {
        savingsChart.destroy();
    }

    const datasets = [];

    if (savings2) {
        datasets.push({
            label: '累計額 (バイト1 + バイト2)',
            data: savings2,
            borderColor: 'rgba(168, 85, 247, 1)',
            backgroundColor: 'rgba(168, 85, 247, 0.1)',
            fill: true,
            tension: 0.1,
            borderWidth: 3
        });
        datasets.push({
            label: '累計額 (バイト1のみ)',
            data: savings1,
            borderColor: 'rgba(6, 182, 212, 1)',
            backgroundColor: 'rgba(6, 182, 212, 0.2)',
            fill: true,
            tension: 0.1,
            borderWidth: 2
        });
    } else {
        datasets.push({
            label: '予想貯蓄額',
            data: savings1,
            borderColor: 'rgba(6, 182, 212, 1)',
            backgroundColor: 'rgba(6, 182, 212, 0.15)',
            fill: true,
            tension: 0.1,
            borderWidth: 3
        });
    }

    const targetLineData = Array(labels.length).fill(targetAmount);
    datasets.push({
        label: '目標金額',
        data: targetLineData,
        borderColor: 'rgba(239, 68, 68, 0.8)',
        borderDash: [5, 5],
        fill: false,
        pointRadius: 0,
        borderWidth: 2
    });

    savingsChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: '#f3f4f6'
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(context.parsed.y);
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    },
                    ticks: {
                        color: '#9ca3af'
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    },
                    ticks: {
                        color: '#9ca3af',
                        callback: function(value) {
                            return value.toLocaleString() + '円';
                        }
                    }
                }
            }
        }
    });
}
