/**
 * Anti-Cheat Monitoring System
 * Detects tab switches and window focus changes during interviews
 */
const antiCheat = {
    tabSwitches: 0,
    isVisible: true,
    warningCount: 0,
    monitoringActive: false,
    focusListeners: [],

    startMonitoring() {
        this.monitoringActive = true;
        this.tabSwitches = 0;
        this.warningCount = 0;

        const handleVisibilityChange = () => {
            if (document.hidden && this.monitoringActive) {
                this.tabSwitches++;
                this.showWarning();
            }
            this.isVisible = !document.hidden;
        };

        const handleBlur = () => {
            if (this.monitoringActive) {
                this.tabSwitches++;
            }
        };

        const handleFocus = () => {
            this.isVisible = true;
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('blur', handleBlur);
        window.addEventListener('focus', handleFocus);

        this.focusListeners = [
            { el: document, event: 'visibilitychange', handler: handleVisibilityChange },
            { el: window, event: 'blur', handler: handleBlur },
            { el: window, event: 'focus', handler: handleFocus }
        ];
    },

    stopMonitoring() {
        this.monitoringActive = false;
        this.focusListeners.forEach(({ el, event, handler }) => {
            el.removeEventListener(event, handler);
        });
        this.focusListeners = [];
    },

    showWarning() {
        const interviewView = document.getElementById('interview-view');
        if (!interviewView || !interviewView.classList.contains('active')) return;

        const warningEl = document.getElementById('anti-cheat-warning');
        if (warningEl) {
            warningEl.style.display = 'flex';
            warningEl.classList.add('warning-flash');
            
            setTimeout(() => {
                warningEl.classList.remove('warning-flash');
            }, 500);
        }
    },

    getIntegrityReport() {
        return {
            is_flagged: this.tabSwitches > 0,
            tab_switches: this.tabSwitches,
            warning_count: this.warningCount
        };
    }
};