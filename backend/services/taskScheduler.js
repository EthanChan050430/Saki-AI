const fs = require('fs-extra');
const path = require('path');

const DATA_DIR = require('./runtime').runtime.dataDir;
fs.ensureDirSync(DATA_DIR);
const TASKS_FILE = path.join(DATA_DIR, 'hosted_tasks.json');

// Ensure tasks file exists
if (!fs.existsSync(TASKS_FILE)) {
    fs.writeJsonSync(TASKS_FILE, [], { spaces: 2 });
}

class TaskScheduler {
    constructor() {
        this.tasks = [];
        this.loadTasks();
    }

    async loadTasks() {
        try {
            await fs.ensureFile(TASKS_FILE);
            const content = await fs.readJson(TASKS_FILE).catch(() => []);
            this.tasks = Array.isArray(content) ? content : [];
            const staleBefore = Date.now() - 15 * 60 * 1000;
            let recovered = false;
            this.tasks.forEach(task => {
                if (task.status === 'running' && (!task.claimedAt || task.claimedAt < staleBefore)) {
                    task.status = 'active';
                    task.claimedAt = null;
                    recovered = true;
                }
            });
            if (recovered) await this.saveTasks();
        } catch (e) {
            console.error('Error loading hosted tasks:', e);
            this.tasks = [];
        }
    }

    async saveTasks() {
        await fs.writeJson(TASKS_FILE, this.tasks, { spaces: 2 });
    }

    /**
     * Add a new task
     * @param {Object} taskConfig 
     * @param {string} taskConfig.task - The instruction prompt
     * @param {string} taskConfig.scheduleType - 'once', 'daily', 'weekly', 'monthly'
     * @param {string} taskConfig.time - "HH:mm" or "YYYY-MM-DD HH:mm"
     * @param {string} taskConfig.desc - Description
     */
    async addTask(taskConfig) {
        const id = Date.now().toString() + Math.random().toString(36).substr(2, 5);
        const newTask = {
            id,
            created: Date.now(),
            lastRun: null,
            status: 'active', // active, paused, completed (for once)
            triggerNow: taskConfig.time === 'now',
            ...taskConfig,
            results: [] // Store history of execution results
        };
        this.tasks.push(newTask);
        await this.saveTasks();
        return newTask;
    }

    async triggerTaskNow(id) {
        const task = this.tasks.find(t => t.id === id);
        if (task) {
            task.triggerNow = true;
            await this.saveTasks();
        }
    }

    async deleteTask(id) {
        this.tasks = this.tasks.filter(t => t.id !== id);
        await this.saveTasks();
    }

    async clearTaskHistory(id) {
        const task = this.tasks.find(t => t.id === id);
        if (task) {
            task.results = [];
            await this.saveTasks();
        }
    }

    async deleteResult(taskId, index) {
        const task = this.tasks.find(t => t.id === taskId);
        if (task && task.results && task.results[index]) {
            task.results.splice(index, 1);
            await this.saveTasks();
            return true;
        }
        return false;
    }

    async listTasks() {
        return this.tasks;
    }

    async getTask(id) {
        return this.tasks.find(t => t.id === id);
    }

    async updateTaskStatus(id, result, sessionId) {
        const task = this.tasks.find(t => t.id === id);
        if (task) {
            task.lastRun = Date.now();
            task.triggerNow = false;
            task.claimedAt = null;
            task.status = 'active'; // Reset from 'running' state

            // If time was 'now', convert it to current time so it becomes a regular schedule
            if (typeof task.time === 'string' && task.time.toLowerCase() === 'now') {
                const n = new Date();
                task.time = `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
            }

            task.results.unshift({
                timestamp: Date.now(),
                success: !result.startsWith('Failed:'),
                summary: result.length > 200 ? result.substring(0, 200) + '...' : result,
                fullResult: result,
                sessionId: sessionId
            });
            // Keep only last 20 results
            if (task.results.length > 20) task.results.pop();

            if (task.scheduleType === 'once') {
                task.status = 'completed';
            }
            await this.saveTasks();
        }
    }

    async setTaskStatus(id, status) {
        const task = this.tasks.find(t => t.id === id);
        if (task) {
            task.status = status;
            task.claimedAt = status === 'running' ? Date.now() : null;
            await this.saveTasks();
        }
    }

    getDueTasks() {
        const now = new Date();
        const dueTasks = [];
        const calendarDay = value => {
            const date = value instanceof Date ? value : new Date(value);
            return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
        };
        const calendarMonth = value => {
            const date = value instanceof Date ? value : new Date(value);
            return `${date.getFullYear()}-${date.getMonth()}`;
        };

        this.tasks.forEach(task => {
            if (task.status !== 'active') return;

            let isDue = false;
            
            // Priority 1: Manual trigger or 'now'
            if (task.triggerNow || (typeof task.time === 'string' && task.time.toLowerCase() === 'now')) {
                isDue = true;
            } else {
                const lastRun = task.lastRun ? new Date(task.lastRun) : null;
                // Prevent double execution in the same minute for scheduled tasks
                if (lastRun && (now.getTime() - lastRun.getTime()) < 60000) return;

                try {
                    if (task.scheduleType === 'once') {
                        const targetTime = new Date(task.time);
                        if (now >= targetTime && !task.lastRun) {
                            isDue = true;
                        }
                    } else if (task.scheduleType === 'daily') {
                        const [h, m] = task.time.split(':').map(Number);
                        if (now.getHours() === h && now.getMinutes() === m) {
                            if (!lastRun || calendarDay(lastRun) !== calendarDay(now)) {
                                isDue = true;
                            }
                        }
                    } else if (task.scheduleType === 'weekly') {
                        const [d, timeStr] = task.time.split(' ');
                        const [h, m] = timeStr.split(':').map(Number);
                        if (now.getDay() === Number(d) && now.getHours() === h && now.getMinutes() === m) {
                            if (!lastRun || calendarDay(lastRun) !== calendarDay(now)) {
                                isDue = true;
                            }
                        }
                    } else if (task.scheduleType === 'monthly') {
                        const [date, timeStr] = task.time.split(' ');
                        const [h, m] = timeStr.split(':').map(Number);
                        if (now.getDate() === Number(date) && now.getHours() === h && now.getMinutes() === m) {
                            if (!lastRun || calendarMonth(lastRun) !== calendarMonth(now)) {
                                isDue = true;
                            }
                        }
                    }
                } catch (err) {
                    console.error(`Error checking task ${task.id}:`, err);
                }
            }

            if (isDue) {
                task.status = 'running';
                task.triggerNow = false;
                task.claimedAt = Date.now();
                dueTasks.push(task);
            }
        });

        if (dueTasks.length > 0) {
            this.saveTasks().catch(error => {
                console.error('Error claiming scheduled tasks:', error);
            });
        }
        return dueTasks;
    }
}

module.exports = new TaskScheduler();
