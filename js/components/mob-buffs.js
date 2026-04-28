// ==========================================
// mob-buffs Lit 组件 — 怪物状态栏（DoT 环形倒计时 + 其他 Buff 图标）
// 替代原手动 createElementNS / appendChild 的复杂拼接
// ==========================================
import { LitElement, html } from '../../lib/lit-core.min.js';
import { EBus } from '../engine.js';

export class MobBuffs extends LitElement {
    static properties = {
        buffs: { type: Array }
    };

    // 环形倒计时总周长：矩形环 2×(宽+高) + 圆角 2πr
    static DOT_TOTAL_LEN = 2 * ((26 - 12) + (26 - 12)) + 2 * Math.PI * 6;

    constructor() {
        super();
        this.buffs = [];
    }

    // 使用 Light DOM 复用 base.css 中的 .buff-icon / .buff-ring 等全局样式
    createRenderRoot() {
        return this;
    }

    connectedCallback() {
        super.connectedCallback();
        this._onMonsterUpdate = (m) => {
            this.buffs = [...(m.buffs || [])];
        };
        EBus.on('ui_monster_update', this._onMonsterUpdate);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        EBus.off('ui_monster_update', this._onMonsterUpdate);
    }

    _renderDoTBuff(buff) {
        const progress = buff.totalDur > 0 ? buff.dur / buff.totalDur : 1;
        const dashOffset = MobBuffs.DOT_TOTAL_LEN * (1 - progress);
        const remaining = Math.ceil(buff.dur / 1000);
        const name = buff.stateName || 'DoT';
        const dpsPct = (buff.dps * 100).toFixed(0);
        let title = `${name}：每秒造成${dpsPct}%攻击力伤害`;
        if (name === '虹吸') title += '并汲取生命';

        return html`
            <div class="buff-icon ${remaining <= 3 ? 'dot-timer-low' : ''}" title="${title}">
                <svg class="buff-ring" viewBox="0 0 28 28">
                    <rect class="buff-ring-bg" x="1" y="1" width="26" height="26" rx="6" ry="6" />
                    <rect class="buff-ring-fg" x="1" y="1" width="26" height="26" rx="6" ry="6"
                        stroke-dasharray="${MobBuffs.DOT_TOTAL_LEN}"
                        stroke-dashoffset="${dashOffset}" />
                </svg>
                <span class="dot-emoji">${buff.stateEmoji || '☠️'}</span>
            </div>
        `;
    }

    _renderSimpleBuff(buff) {
        return html`
            <div class="buff-icon buff-icon-simple" title="${buff.type}">📜</div>
        `;
    }

    render() {
        return html`
            ${this.buffs.map(buff => buff.type === 'dot' ? this._renderDoTBuff(buff) : this._renderSimpleBuff(buff))}
        `;
    }
}

customElements.define('mob-buffs', MobBuffs);
