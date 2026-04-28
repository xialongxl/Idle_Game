// ==========================================
// sequence-list Lit 组件 — 技能执行序列列表
// 替代原 renderSequence() 中的 innerHTML += 拼接
// ==========================================
import { LitElement, html } from '../../lib/lit-core.min.js';
import { SKILLS_DB } from '../data.js';

export class SequenceList extends LitElement {
    static properties = {
        ids: { type: Array },
        openers: { type: Array }
    };

    constructor() {
        super();
        this.ids = [];
        this.openers = [];
    }

    // 使用 Light DOM，保持 #seq_dom_xxx 的 id 可被 ui_cast_highlight 查询
    createRenderRoot() {
        return this;
    }

    render() {
        return html`
            ${this.ids.map((id, i) => {
                const sk = SKILLS_DB.find(x => x.id === id);
                if (!sk) return '';
                const isOpener = this.openers.includes(id);
                return html`
                    <li class="seq-item" id="seq_dom_${id}">
                        <div>
                            <b style="color:var(--primary)">${i + 1}.</b>
                            ${sk.name}
                            ${isOpener ? html`<span class="opener-tag">起手</span>` : ''}
                        </div>
                        <div class="seq-actions">
                            <button @click="${() => window.ui.toggleOpener(id)}">设为起手</button>
                            ${i > 0 ? html`<button @click="${() => window.ui.moveSequence(i, -1)}">↑</button>` : ''}
                            ${i < this.ids.length - 1 ? html`<button @click="${() => window.ui.moveSequence(i, 1)}">↓</button>` : ''}
                            <button @click="${() => window.ui.removeSequence(i)}" style="color:red">X</button>
                        </div>
                    </li>
                `;
            })}
        `;
    }
}

customElements.define('sequence-list', SequenceList);
