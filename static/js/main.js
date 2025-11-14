document.addEventListener('DOMContentLoaded', function() {
    
    const startPicker = flatpickr("#start-date", {
        dateFormat: "Y-m-d",
        defaultDate: new Date(),
        onChange: function(selectedDates, dateStr) {
            updateTimelineInfo();
            if (selectedDates[0]) {
                endPicker.set('minDate', selectedDates[0]);
            }
        }
    });

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 25);

    const endPicker = flatpickr("#end-date", {
        dateFormat: "Y-m-d",
        minDate: new Date(),
        onChange: function() {
            updateTimelineInfo();
        }
    });

    const dropdown = document.getElementById('modules-dropdown');
    const dropdownContent = document.getElementById('modules-content');
    const modulesCount = document.getElementById('modules-count');
    const modulesSearch = document.getElementById('modules-search');

    if (dropdown && dropdownContent) {
        // Toggle dropdown
        dropdown.onclick = function(e) {
            e.stopPropagation();
            dropdown.classList.toggle('open');
            dropdownContent.classList.toggle('open');
        };

        dropdownContent.onclick = function(e) {
            e.stopPropagation();
        };

        document.onclick = function() {
            dropdown.classList.remove('open');
            dropdownContent.classList.remove('open');
        };

        function updateCount() {
            const checked = document.querySelectorAll('.module-check:checked').length;
            modulesCount.textContent = checked + ' selected';
        }

        document.querySelectorAll('.module-check').forEach(function(checkbox) {
            checkbox.onchange = updateCount;
        });

        if (modulesSearch) {
            modulesSearch.oninput = function() {
                const search = this.value.toLowerCase();
                document.querySelectorAll('.dropdown-option').forEach(function(option) {
                    const text = option.textContent.toLowerCase();
                    option.style.display = text.includes(search) ? 'flex' : 'none';
                });
            };
        }
    }

    function updateTimelineInfo() {
        const startDate = startPicker.selectedDates[0];
        const endDate = endPicker.selectedDates[0];
        
        if (!startDate || !endDate) return;
        
        const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
        const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
        const days = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
        
        const infoBox = document.getElementById('timeline-info');
        infoBox.classList.remove('hidden');
        
        const startStr = startDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        const endStr = endDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        
        if (days < 15) {
            infoBox.className = 'info-banner error';
            infoBox.textContent = `Minimum 15 days required. You have ${days} days.`;
        } else if (days > 40) {
            infoBox.className = 'info-banner warning';
            infoBox.textContent = `You have ${days} days. Plan is optimized for 15-40 days.`;
        } else {
            infoBox.className = 'info-banner';
            infoBox.textContent = `Planning for ${days} days from ${startStr} to ${endStr}`;
        }
        
        validatePaceOptions(days);
    }
    function validatePaceOptions(days) {
        const intensiveRadio = document.querySelector('input[name="pace"][value="intensive"]');
        const balancedRadio = document.querySelector('input[name="pace"][value="balanced"]');
        const relaxedRadio = document.querySelector('input[name="pace"][value="relaxed"]');
        
        const intensiveLabel = intensiveRadio.closest('.radio-label');
        const balancedLabel = balancedRadio.closest('.radio-label');
        const relaxedLabel = relaxedRadio.closest('.radio-label');
        
        [intensiveRadio, balancedRadio, relaxedRadio].forEach(radio => {
            radio.disabled = false;
            radio.closest('.radio-label').classList.remove('disabled');
            radio.closest('.radio-label').removeAttribute('title');
        });
        
        if (days < 25) {
            relaxedRadio.disabled = true;
            relaxedLabel.classList.add('disabled');
            relaxedLabel.setAttribute('title', 'Days are too short to be relaxed. Get up!');
            
            if (relaxedRadio.checked) {
                balancedRadio.checked = true;
            }
        }
        
        if (days < 20) {
            balancedRadio.disabled = true;
            balancedLabel.classList.add('disabled');
            balancedLabel.setAttribute('title', 'Not enough days for balanced pace. Need intensive!');
            
            intensiveRadio.checked = true;
        }
        
        if (days > 35) {
            intensiveRadio.disabled = true;
            intensiveLabel.classList.add('disabled');
            intensiveLabel.setAttribute('title', 'You have plenty of time. No need for intensive pace.');
            
            if (intensiveRadio.checked) {
                balancedRadio.checked = true;
            }
        }
    }

    document.getElementById('generate-btn').addEventListener('click', async function() {
        console.log('Generate clicked');
        
        const startDateStr = document.getElementById('start-date').value;
        const endDateStr = document.getElementById('end-date').value;
        
        console.log('Start date string:', startDateStr);
        console.log('End date string:', endDateStr);
        
        if (!startDateStr || !endDateStr) {
            alert('Please select both start and end dates');
            return;
        }
        
        const startDate = new Date(startDateStr);
        const endDate = new Date(endDateStr);
        const days = Math.round((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
        
        console.log('Calculated days:', days);
        
        if (days < 15) {
            alert('Minimum 15 days required');
            return;
        }
        
        const pace = document.querySelector('input[name="pace"]:checked').value;
        const completedModules = Array.from(document.querySelectorAll('.module-check:checked')).map(cb => cb.value);
        
        if (dropdown) {
            dropdown.classList.remove('open');
            dropdownContent.classList.remove('open');
        }
        
        document.getElementById('loading').classList.remove('hidden');
        document.getElementById('results').classList.add('hidden');
        
        try {
            const response = await fetch('/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    start_date: startDateStr,
                    end_date: endDateStr,
                    pace: pace,
                    completed_modules: completedModules
                })
            });
            
            console.log('Response received');
            
            const data = await response.json();
            
            if (data.error) {
                alert(data.error);
                return;
            }
            
            displayResults(data, startDateStr, pace);
            
        } catch (error) {
            console.error('Error:', error);
            alert('Failed to generate schedule: ' + error.message);
        } finally {
            document.getElementById('loading').classList.add('hidden');
        }
    });

    function displayResults(data, startDate, pace) {
        const { schedule, metrics } = data;
        
        console.log('Metrics received:', metrics);
        
        const scheduledDaysEl = document.getElementById('scheduled-days');
        const studyPaceEl = document.getElementById('study-pace');
        const remainingModulesEl = document.getElementById('remaining-parts');
        
        if (scheduledDaysEl) {
            scheduledDaysEl.textContent = metrics.scheduled_days;
            console.log('Set scheduled days:', metrics.scheduled_days);
        }
        if (studyPaceEl) {
            studyPaceEl.textContent = pace.charAt(0).toUpperCase() + pace.slice(1);
        }
        if (remainingModulesEl) {
            remainingModulesEl.textContent = metrics.total_modules;
        }
        
        const statusMsg = document.getElementById('status-message');
        if (statusMsg) {
            statusMsg.classList.remove('hidden');
            
            const finishDate = new Date(metrics.finish_date).toLocaleDateString('en-US', { 
                month: 'long', 
                day: 'numeric', 
                year: 'numeric' 
            });
            
            if (metrics.buffer_days >= 0) {
                statusMsg.className = 'status-message success';
                statusMsg.textContent = `Finish by ${finishDate} with ${metrics.buffer_days} buffer days`;
            } else {
                statusMsg.className = 'status-message warning';
                statusMsg.textContent = `Plan requires ${metrics.scheduled_days} days, exceeding available days`;
            }
        }
        
        const scheduleContainer = document.getElementById('schedule-container');
        if (!scheduleContainer) {
            console.error('Schedule container not found');
            return;
        }
        
        scheduleContainer.innerHTML = '';
        
        schedule.forEach(day => {
            const dayDate = new Date(startDate);
            dayDate.setDate(dayDate.getDate() + day.day_number - 1);
            
            const dateStr = dayDate.toLocaleDateString('en-US', { 
                weekday: 'long', 
                month: 'long', 
                day: 'numeric' 
            });
            
            const dayDiv = document.createElement('div');
            dayDiv.className = 'schedule-day';
            
            const header = document.createElement('div');
            header.className = 'day-header';
            header.textContent = `Day ${day.day_number} — ${dateStr} (${day.topics.length} blocks)`;
            dayDiv.appendChild(header);
            
            const content = document.createElement('div');
            content.className = 'day-content';
            
            if (day.topics && Array.isArray(day.topics)) {
                day.topics.forEach(topic => {
                    const topicDiv = document.createElement('div');
                    topicDiv.className = 'topic-item';
                    
                    const topicInfo = document.createElement('div');
                    topicInfo.className = 'topic-info';
                    
                    const title = document.createElement('div');
                    title.className = 'topic-title';
                    title.textContent = `${topic.course || ''} — ${topic.module || ''}`;
                    topicInfo.appendChild(title);
                    
                    const desc = document.createElement('div');
                    desc.className = 'topic-description';
                    desc.textContent = topic.topics || '';
                    topicInfo.appendChild(desc);
                    
                    topicDiv.appendChild(topicInfo);
                    
                    if (topic.colab_link && topic.colab_link !== 'nan' && topic.colab_link.trim()) {
                        const colabLink = document.createElement('a');
                        colabLink.href = topic.colab_link;
                        colabLink.target = '_blank';
                        colabLink.className = 'colab-link';
                        colabLink.innerHTML = '<img src="https://colab.research.google.com/assets/colab-badge.svg" alt="Open In Colab" width="120" height="30">';
                        topicDiv.appendChild(colabLink);
                    }
                    
                    content.appendChild(topicDiv);
                });
            }
            
            dayDiv.appendChild(content);
            scheduleContainer.appendChild(dayDiv);
        });
        
        // Show results
        const resultsEl = document.getElementById('results');
        if (resultsEl) {
            resultsEl.classList.remove('hidden');
            resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        

        window.currentSchedule = { schedule, start_date: startDate, pace };    }

    // Download Excel
    document.getElementById('download-btn').addEventListener('click', async function() {
        if (!window.currentSchedule) return;
        
        try {
            const response = await fetch('/download', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(window.currentSchedule)
            });
            
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `study_plan_${window.currentSchedule.start_date}.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            
        } catch (error) {
            alert('Failed to download: ' + error.message);
        }
    });
});