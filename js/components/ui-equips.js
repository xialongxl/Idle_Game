// ==========================================
// ui-equips Lit 组件 — 装备栏网格
// 替代原 innerHTML += 手动拼接，声明式渲染 8 个槽位
// ==========================================
import { LitElement, html } from '../../lib/lit-core.min.js';
import { GEAR_RARITY, SLOTS, SLOT_NAMES } from '../data.js';
import { formatNumber } from '../engine.js';

export class UiEquips extends LitElement {
    static properties = {
        equips: { type: Object },
        finaleCollection: { type: Object }
    };

    constructor() {
        super();
        this.equips = {};
        this.finaleCollection = {};
    }

    // 使用 Light DOM 复用 base.css 中 .equip-slot / .equip-grid 等全局样式
    createRenderRoot() {
        return this;
    }

    _renderSlot(slot) {
        const eq = this.equips[slot];
        if (eq) {
            return html`
                <div class="equip-slot" style="cursor:pointer"
                    @click="${() => window.ui.openSlotView(slot)}">
                    <div class="equip-name ${GEAR_RARITY[eq.rarityIdx].color}">${eq.name}</div>
                    <div class="equip-stats">装备评分: ${formatNumber(eq.score)}</div>
                    ${eq.enhanceLv > 0 ? html`<div class="enhance-tag">+${eq.enhanceLv}</div>` : ''}
                    ${eq.pinned ? html`<div style="position:absolute;top:2px;left:2px;font-size:10px;">📌</div>` : ''}
                </div>
            `;
        } else {
            return html`
                <div class="equip-slot" style="cursor:pointer"
                    @click="${() => window.ui.openSlotView(slot)}">
                    <div class="equip-name" style="color:var(--text-mut)">[点击选取]</div>
                    <div class="equip-stats">${SLOT_NAMES[slot]}</div>
                </div>
            `;
        }
    }

    render() {
        return html`
            ${SLOTS.map(slot => this._renderSlot(slot))}
        `;
    }
}

customElements.define('ui-equips', UiEquips);
