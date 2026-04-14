// ==========================================
// 界面 UI 控制器及其交互核心
// 负责全面响应引擎的数据驱动 及事件下发
// ==========================================
import { SKILLS_DB, GEAR_RARITY, SLOTS, SLOT_NAMES, ORBS, MAX_SAME_ORB } from './data.js';
import { EBus, Storage, formatNumber } from './engine.js';

export class UIController {
    constructor(player) {
        this.player = player;
        this.bindEvents();
        this.initSkillPool();
        this.initTabs();
        this.loadSequenceData();
        
        // Modal 面板弹窗的上下文临时缓存记录器
        this.modalContext = { targetGear: null, isBody: false, index: -1 };
        this.currentFilterSlot = null; // 背包部位筛选状态
    }

    // 🌟 全局事件统合：所有的界面状态流转都在这里监听渲染
    bindEvents() {
        EBus.on('ui_skills_update', () => {
            this.initSkillPool();
        });

        EBus.on('ui_bars_update', () => {
            document.getElementById('ui-level').innerText = `Lv.${this.player.level}`;
            
            let hpFillPct = (Math.max(0, this.player.hp) / this.player.getMaxHp()) * 100;
            document.getElementById('ui-hp-fill').style.width = `${hpFillPct}%`;
            
            // 采用格式化输出保证千万级血量不断层
            let currentHpFmt = formatNumber(Math.floor(Math.max(0, this.player.hp)));
            let maxHpFmt = formatNumber(this.player.getMaxHp());
            document.getElementById('ui-hp-txt').innerText = `${currentHpFmt}/${maxHpFmt}`;
            
            let mpFillPct = (this.player.mp / this.player.getMaxMp()) * 100;
            document.getElementById('ui-mp-fill').style.width = `${mpFillPct}%`;
            
            let currentMpFmt = formatNumber(Math.floor(this.player.mp));
            let maxMpFmt = formatNumber(this.player.getMaxMp());
            document.getElementById('ui-mp-txt').innerText = `${currentMpFmt}/${maxMpFmt}`;
            
            let maxExp = this.player.getExpReq();
            let expFillPct = (this.player.exp / maxExp) * 100;
            document.getElementById('ui-exp-fill').style.width = `${expFillPct}%`;
            document.getElementById('ui-exp-txt').innerText = `${expFillPct.toFixed(1)}%`;
            
            document.getElementById('ui-gold').innerText = formatNumber(Math.floor(this.player.gold));
            
            // 🔒 背包满红点逻辑
            this.updateInvStatus();
        });

        EBus.on('ui_stats_update', (p) => {
            // 大数字简化，攻防数字太变态了
            document.getElementById('stat-atk').innerText = formatNumber(p.stats.atk);
            document.getElementById('stat-int').innerText = formatNumber(p.stats.int);
            document.getElementById('stat-haste').innerText = p.stats.haste.toFixed(1);
            document.getElementById('stat-crit').innerText = p.stats.crit.toFixed(1);
            document.getElementById('stat-versa').innerText = p.stats.versa.toFixed(1);
            
            // 计算由于急速带来的真实最终公共冷却
            document.getElementById('stat-gcd').innerText = (2.5 / (1 + p.stats.haste / 100)).toFixed(2) + 's';
        });

        EBus.on('ui_equips_update', () => {
            const container = document.getElementById('ui-equips');
            container.innerHTML = '';
            
            SLOTS.forEach(s => {
                let eq = this.player.equips[s];
                // 🌟 核心重构：统一槽位点击行为，无论有无装备，都聚焦该部位！
                let clickAction = `onclick="window.ui.openSlotView('${s}')"`;
                if (eq) {
                    container.innerHTML += `
                    <div class="equip-slot" ${clickAction} style="cursor:pointer">
                        <div class="equip-name ${GEAR_RARITY[eq.rarityIdx].color}">${eq.name}</div>
                        <div class="equip-stats">装备评分: ${formatNumber(eq.score)}</div>
                        ${eq.enhanceLv > 0 ? `<div class="enhance-tag">+${eq.enhanceLv}</div>` : ''}
                        ${eq.pinned ? `<div style="position:absolute;top:2px;left:2px;font-size:10px;">📌</div>` : ''}
                    </div>`;
                } else {
                    container.innerHTML += `
                    <div class="equip-slot" ${clickAction} style="cursor:pointer">
                        <div class="equip-name" style="color:var(--text-mut)">[点击选取]</div>
                        <div class="equip-stats">${SLOT_NAMES[s]}</div>
                    </div>`;
                }
            });
        });

        EBus.on('ui_monster_update', (m) => {
            document.getElementById('mob-name').innerText = m.name;
            
            let hpPercent = Math.max(0, (m.hp / m.maxHp) * 100);
            document.getElementById('mob-hp-fill').style.width = hpPercent + '%';
            
            let curF = formatNumber(Math.floor(Math.max(0, m.hp)));
            let maxF = formatNumber(m.maxHp);
            document.getElementById('mob-hp-txt').innerText = `${curF}/${maxF}`;
            
            // 将怪物挂上的 DEBUFF 变成直观图标阵列
            document.getElementById('mob-buffs').innerHTML = m.buffs
                .map(b => `<div class="buff-icon" title="${b.type}">${b.type === 'dot' ? '☠️' : '📜'}</div>`)
                .join('');
        });

        // 🔒 战斗日志增量追加：创建 div 追加到容器，超出 200 移除首个
        EBus.on('log_append', htmlStr => {
            const logger = document.getElementById('combat-log');
            let div = document.createElement('div');
            div.innerHTML = htmlStr;
            logger.appendChild(div.firstChild);
            if (logger.children.length > 200) {
                logger.removeChild(logger.firstChild);
            }
            logger.scrollTop = logger.scrollHeight;
        });

        // 🔒 系统消息限时弹窗：右上角浮动通知，包含关闭按钮和5秒自动消失进度条
        EBus.on('sys_message', msg => {
            const container = document.getElementById('toast-container');
            if (!container) return;
            const card = document.createElement('div');
            card.className = 'toast-card';
            card.innerHTML = `
                <div class="toast-close" onclick="this.parentElement.remove()">✕</div>
                <div class="toast-msg">${msg}</div>
                <div class="toast-bar" style="animation: toast-shrink 5s linear forwards;"></div>
            `;
            container.appendChild(card);
            // 5秒后自动移除
            setTimeout(() => {
                if (card.parentElement) {
                    card.remove();
                }
            }, 5000);
        });

        // 技能列表的高亮描边光环
        EBus.on('ui_cast_highlight', sid => {
            document.querySelectorAll('.seq-item').forEach(e => e.classList.remove('active-cast'));
            let targetEl = document.getElementById(`seq_dom_${sid}`);
            if (targetEl) {
                targetEl.classList.add('active-cast');
            }
        });

        // 遮罩计算技能正在恢复读取的百分比 CD 黑屏
        EBus.on('ui_skills_cd', skillArray => {
            skillArray.forEach(s => {
                let domEl = document.getElementById(`pool_${s.id}`);
                if (domEl) {
                    domEl.style.setProperty('--cd-pct', s.currentCd > 0 ? (s.currentCd / s.cd) * 100 + '%' : '0%');
                }
            });
        });

        // ==========================================
        // 所有的 HTML 控件监听触发全部位于下端
        // 包含速度、自动分解、保存动作缓存、暂停和远征
        // ==========================================
        document.querySelectorAll('#speed-controls button').forEach(b => {
            b.addEventListener('click', e => {
                document.querySelectorAll('#speed-controls button').forEach(x => x.classList.remove('active'));
                e.target.classList.add('active');
                EBus.emit('speed_changed', parseFloat(e.target.dataset.speed));
            });
        });

        document.getElementById('ui-salvage').value = Storage.get('salvage_idx', -1);
        document.getElementById('ui-salvage').addEventListener('change', e => Storage.set('salvage_idx', e.target.value));

        document.getElementById('ui-retreat-pct').value = Storage.get('retreat_pct', 30);
        document.getElementById('ui-retreat-pct').addEventListener('change', e => Storage.set('retreat_pct', e.target.value));

        document.getElementById('btn-clear-seq').addEventListener('click', () => {
            this.currentLoadout.ids = [];
            this.currentLoadout.openers = [];
            this.renderSequence();
            this.saveSequence();
        });

        document.getElementById('btn-explore').addEventListener('click', () => {
            window.engine.startExplore();
        });

        document.getElementById('btn-pause').addEventListener('click', (e) => {
            window.engine.paused = !window.engine.paused;
            e.target.innerText = window.engine.paused ? '▶ 继续' : '⏸ 暂停';
            if (window.engine.paused) {
                EBus.emit('log', '⏸ 时间已冻结。', 'sys');
            }
        });

        // 强行脱离战场退回最近安保区
        document.getElementById('btn-retreat').addEventListener('click', () => {
            window.engine.triggerRetreat(true);
        });

        // 花费 50G 为探索买单恢复体力
        document.getElementById('btn-heal').addEventListener('click', () => {
            if (window.engine.state !== 'camp') {
                return alert("只能在安全的星盘营地中进行瞬间治疗！");
            }
            if (this.player.hp >= this.player.getMaxHp() && this.player.mp >= this.player.getMaxMp()) {
                return alert("状态良好，无需治疗。");
            }
            if (this.player.gold < 50) {
                return alert("金币不足 50G！");
            }
            
            this.player.gold -= 50;
            this.player.hp = this.player.getMaxHp();
            this.player.mp = this.player.getMaxMp();
            EBus.emit('ui_bars_update');
            EBus.emit('log', '✨ 消耗 50G，状态已完全恢复！', 'sys');
        });
    }

    // ==========================================
    // 万能背包系统与强化锻造界面业务
    // ==========================================
    
    // 🔒 小红点独立圆点提示
    updateInvStatus() {
        let dot = document.getElementById('inv-reddot');
        let count = this.player.inventory.length;
        // 控制红点显隐
        if (count >= 30) {
            dot.style.display = 'block';
        } else {
            dot.style.display = 'none';
        }
    }

    // 点击专门的背包按钮：清空筛选，显示全部
    openBackpack() {
        this.currentFilterSlot = null;
        this._renderBackpack();
        document.getElementById('item-details').style.display = 'none';
    }

    // 点击装备栏槽位：锁定该部位，并展示当前详情
    openSlotView(slot) {
        this.currentFilterSlot = slot;
        this._renderBackpack();
        // 如果身上穿着这个部位的装备，顺便打开它的详情
        if (this.player.equips[slot]) {
            this.openGearDetail(slot, true);
        } else {
            document.getElementById('item-details').style.display = 'none';
        }
    }

    _renderBackpack() {
        document.getElementById('modal-overlay').style.display = 'flex';

        let area = document.getElementById('modal-content-area');
        area.innerHTML = '';

        let filterSlot = this.currentFilterSlot;
        if (filterSlot) {
            document.getElementById('modal-title').innerText = `🎒 装备选取 - ${SLOT_NAMES[filterSlot]} (${this.player.inventory.length}/30)`;
        } else {
            document.getElementById('modal-title').innerText = `🎒 星盘背包 (${this.player.inventory.length}/30)`;
        }

        let hasItem = false;
        this.player.inventory.forEach((gear, i) => {
            // 如果有筛选槽位，且装备不是该槽位，则跳过不显示
            if (filterSlot && gear.slot !== filterSlot) {
                return; 
            }
            
            hasItem = true;
            area.innerHTML += `
            <div class="inv-item" onclick="window.ui.openGearDetail(${i}, false)">
                <div class="${GEAR_RARITY[gear.rarityIdx].color}" style="font-weight:bold;">
                    ${gear.name} ${gear.enhanceLv > 0 ? '+' + gear.enhanceLv : ''} ${gear.pinned ? '📌' : (gear.locked ? '🔒' : '')}
                </div>
                <div style="font-size:11px; margin-top:5px; color:var(--text-mut);">总评分: ${formatNumber(gear.score)} | ${SLOT_NAMES[gear.slot]}</div>
            </div>`;
        });

        if (!hasItem) {
            area.innerHTML += `<div style='color:gray; width:100%; text-align:center; padding:20px;'>${filterSlot ? '没有找到适合该部位的装备' : '行囊空空如也...'}</div>`;
        }

        // 底部增加切回全材料视图的按钮
        if (filterSlot) {
            area.innerHTML += `<button onclick="window.ui.openBackpack()" style="width:100%; margin-top:15px; background:transparent; border:1px dashed #666; color:#aaa; cursor:pointer; padding:5px;">↩ 显示全部装备</button>`;
        }
    }

    openGearDetail(idxOrSlot, isEquipped) {
        document.getElementById('modal-overlay').style.display = 'flex';
        let gear = isEquipped ? this.player.equips[idxOrSlot] : this.player.inventory[idxOrSlot];
        
        if (!gear) {
            return;
        }

        this.modalContext = { targetGear: gear, isBody: isEquipped, index: idxOrSlot };

        document.getElementById('item-details').style.display = 'block';
        document.getElementById('det-name').innerHTML = `
            <span class="${GEAR_RARITY[gear.rarityIdx].color}">
                ${gear.name} ${gear.enhanceLv > 0 ? '+' + gear.enhanceLv : ''} ${gear.pinned ? '📌' : (gear.locked ? '🔒' : '')}
            </span>`;

        let isAccessory = (gear.slot === 'ring' || gear.slot === 'trinket');
        
        // 🔒 评分显示重构：总分(含宝珠) 与 装备基础分 独立展示
        let orbScore = (gear.score || 0) - (gear.baseScore || 0);
        let statsHtml = `<b>总评分: <span style="color:var(--primary)">${formatNumber(gear.score || 0)}</span>${orbScore > 0 ? ` <span style="color:#a855f7">(+${formatNumber(orbScore)})</span>` : ''}</b><br>`;
        statsHtml += `装备评分: ${formatNumber(gear.baseScore || 0)}<br>`;

        // 🔒 获取宝珠加成汇总，用于在属性区显示增量
        let orbBonus = this.player.getGearOrbBonus(gear);

        // 直观且标准的属性解构陈列 (恢复紧凑排版，不换行)
        if (gear.slot === 'weapon') {
            statsHtml += `攻击力: ${formatNumber(Math.floor(gear.stats.atk || 0))}`;
            if (orbBonus.atk_pct) statsHtml += ` <span style="color:#a855f7">(+${orbBonus.atk_pct}%)</span>`;
            statsHtml += `<br>`;
        } else if (isAccessory) {
            statsHtml += `攻击力: ${formatNumber(Math.floor(gear.stats.atk || 0))}`;
            if (orbBonus.atk_pct) statsHtml += ` <span style="color:#a855f7">(+${orbBonus.atk_pct}%)</span>`;
            statsHtml += ` | 防御力: ${formatNumber(Math.floor(gear.stats.int || 0))}<br>`;
        } else {
            statsHtml += `防御力: ${formatNumber(Math.floor(gear.stats.int || 0))}<br>`;
            // 🔒 防具镶了攻击宝珠，单列一行，带上括号
            if (orbBonus.atk_pct) statsHtml += `攻击力: <span style="color:#a855f7">+${orbBonus.atk_pct}%</span><br>`;
        }

        // 副属性 (紧凑排版)
        if (gear.stats.crit) statsHtml += `暴击率: +${(gear.stats.crit).toFixed(1)}%${orbBonus.crit ? ` <span style="color:#a855f7">(+${orbBonus.crit}%)</span>` : ''}　`;
        if (gear.stats.haste) statsHtml += `冷却缩减: +${(gear.stats.haste).toFixed(1)}%${orbBonus.haste ? ` <span style="color:#a855f7">(+${orbBonus.haste}%)</span>` : ''}　`;
        if (gear.stats.versa) statsHtml += `共鸣: +${(gear.stats.versa).toFixed(1)}%${orbBonus.versa ? ` <span style="color:#a855f7">(+${orbBonus.versa}%)</span>` : ''}　`;
        
        // 🔒 宝珠提供的额外属性独立显示 (生命、终焉冷却等)
        if (orbBonus.hp_pct) statsHtml += `　最大生命: <span style="color:#a855f7">+${orbBonus.hp_pct}%</span>`;
        if (orbBonus.finale_cd) statsHtml += `　终焉冷却: <span style="color:#a855f7">+${orbBonus.finale_cd}%</span>`;

        // 🔮 宝珠镶嵌 UI 区块：支持3孔位，只显示拥有的，拆卸无损退回
        statsHtml += `<div style="margin-top:10px; border-top:1px dashed #444; padding-top:8px;">`;
        statsHtml += `<b style="color:#a855f7">🔮 宝珠孔位 (同类全身最多生效${MAX_SAME_ORB}个)：</b><br>`;
        
        if (!gear.orbs) gear.orbs = [null, null, null]; // 兼容旧装备

        for (let i = 0; i < 3; i++) {
            let oid = gear.orbs[i];
            statsHtml += `<div style="margin-top:4px; display:flex; align-items:center;">孔位${i+1}: `;
            if (oid) {
                let orb = ORBS.find(o => o.id === oid);
                statsHtml += `<span style="color:#c084fc; margin:0 5px;">[${orb.name}] (${orb.desc})</span>`;
                statsHtml += `<button onclick="window.ui.removeOrb(${i})" style="font-size:11px; padding:1px 4px; background:transparent; border:1px solid #ef4444; color:#ef4444; cursor:pointer;">卸下</button>`;
            } else {
                statsHtml += `<span style="color:#666; margin-right:5px;">[空]</span>`;
                // 遍历玩家拥有的宝珠生成镶嵌按钮
                let hasOrb = false;
                ORBS.forEach(o => {
                    let count = this.player.orbs[o.id] || 0;
                    if (count > 0) {
                        hasOrb = true;
                        statsHtml += `<button onclick="window.ui.embedOrb('${o.id}', ${i})" style="margin-right:3px; font-size:10px; padding:1px 4px; background:#1e1e2e; border:1px solid #a855f7; color:#d8b4fe; cursor:pointer">${o.name}(${count})</button>`;
                    }
                });
                if (!hasOrb) {
                    statsHtml += `<span style="color:#555; font-size:10px;">无可用宝珠</span>`;
                }
            }
            statsHtml += `</div>`;
        }
        statsHtml += `</div>`;

        document.getElementById('det-stats').innerHTML = statsHtml;

        let actionsDiv = document.getElementById('det-actions');
        let sellPrice = Math.max(0, (gear.rarityIdx + 1) * 20) * (gear.enhanceLv + 1);
        let enhancePrice = Math.max(100, (gear.rarityIdx + 1) * 300 * (gear.enhanceLv + 1));

        let enhancePriceFmt = formatNumber(enhancePrice);
        let sellPriceFmt = formatNumber(sellPrice);

        // 🔒 恢复双锁按钮：普通锁(防误卖) 和 防换锁(防替换)
        let lockBtn = `<button onclick="window.ui.toggleLock()" style="border-color:#facc15;color:#facc15">${gear.locked ? '🔓 解锁' : '🔒 锁定'}</button>`;
        let pinBtn = `<button onclick="window.ui.togglePin()" style="border-color:#ff0055;color:#ff0055">${gear.pinned ? '📍 解除防换' : '📌 锁定防换'}</button>`;

        if (isEquipped) {
            actionsDiv.innerHTML = `
                ${lockBtn} ${pinBtn}
                <button onclick="window.ui.enhanceGear()" style="background:var(--accent);border-color:var(--accent)">
                    ⚒️ 花费 ${enhancePriceFmt}G 强化
                </button>
                <button onclick="window.ui.unequipGear()">👇 卸下放回背包</button>`;
        } else {
            actionsDiv.innerHTML = `
                ${lockBtn} ${pinBtn}
                <button onclick="window.ui.equipFromPack()" style="background:var(--primary);border-color:var(--primary)">
                    ✨ 穿戴 / 替换现装
                </button>
                <button onclick="window.ui.sellFromPack()" style="border-color:#facc15;color:#facc15">
                    💰 出售获得 ${sellPriceFmt}G
                </button>`;
        }
    }

    // 🔒 切换普通锁定状态 (防误卖)
    toggleLock() {
        let gear = this.modalContext.targetGear;
        gear.locked = !gear.locked;
        this.player.save();
        this.openGearDetail(this.modalContext.index, this.modalContext.isBody);
        EBus.emit('log', `🔒 [${gear.name}] 已${gear.locked ? '锁定' : '解锁'}`, 'sys');
    }

    // 🔒 切换防替换锁定状态 (联动防误卖)
    togglePin() {
        let gear = this.modalContext.targetGear;
        gear.pinned = !gear.pinned;
        // 如果上了防替换锁，必定锁上防误卖锁
        if (gear.pinned) {
            gear.locked = true;
        } else {
            // 解除防替换锁时，终焉装备依然要保持防误卖锁
            gear.locked = (gear.rarityIdx === 8); 
        }

        this.player.save();
        this.openGearDetail(this.modalContext.index, this.modalContext.isBody);
        EBus.emit('ui_equips_update');
        EBus.emit('log', `📌 [${gear.name}] 已${gear.pinned ? '锁定防换' : '解除防换'}`, 'sys');
    }

    // 镶嵌宝珠到指定孔位
    embedOrb(orbId, slotIndex) {
        let gear = this.modalContext.targetGear;
        if (!gear.orbs) gear.orbs = [null, null, null];
        if (gear.orbs[slotIndex]) return alert('该孔位已被占用！');

        let count = this.player.orbs[orbId] || 0;
        if (count <= 0) return; // 理论上按钮都不显示了，防手残

        // 扣除背包宝珠
        this.player.orbs[orbId]--;
        // 镶入装备
        gear.orbs[slotIndex] = orbId;

        // 🔒 实时重算装备评分并刷新UI
        this.player.recalcGearScore(gear);
        this.player.recalcStats();
        this.player.save();
        this.openGearDetail(this.modalContext.index, this.modalContext.isBody); // 刷新详情
        EBus.emit('log', `🔮 成功镶嵌了 [${ORBS.find(o=>o.id===orbId).name}]`, 'sys');
    }

    // 无损卸下指定孔位的宝珠
    removeOrb(slotIndex) {
        let gear = this.modalContext.targetGear;
        if (!gear.orbs || !gear.orbs[slotIndex]) return;
        let oid = gear.orbs[slotIndex];
        let orb = ORBS.find(o => o.id === oid);

        // 退还背包
        this.player.orbs[oid] = (this.player.orbs[oid] || 0) + 1;
        // 清空孔位
        gear.orbs[slotIndex] = null;

        // 🔒 实时重算装备评分并刷新UI
        this.player.recalcGearScore(gear);
        this.player.recalcStats();
        this.player.save();
        this.openGearDetail(this.modalContext.index, this.modalContext.isBody);
        EBus.emit('log', `✨ 卸下了 [${orb.name}]，已退回背包`, 'sys');
    }

    equipFromPack() {
        let gearToEquip = this.modalContext.targetGear;
        let oldGear = this.player.equips[gearToEquip.slot];

        this.player.equips[gearToEquip.slot] = gearToEquip;
        
        if (oldGear) {
            this.player.inventory[this.modalContext.index] = oldGear;
        } else {
            this.player.inventory.splice(this.modalContext.index, 1);
        }

        this.player.recalcStats();
        this.player.save();
        EBus.emit('ui_equips_update');
        
        // 🌟 核心修复：穿戴后保持部位筛选，并展示刚穿上的装备详情
        this.currentFilterSlot = gearToEquip.slot; 
        this._renderBackpack(); 
        this.openGearDetail(gearToEquip.slot, true);
        EBus.emit('log', `系统：穿戴了 [${gearToEquip.name}]`, 'sys');
    }

    unequipGear() {
        let slotName = this.modalContext.index;
        let gearToRemove = this.player.equips[slotName];
        
        if (this.player.inventory.length >= 30) {
            return alert('背包已满，无法卸下装备！');
        }

        this.player.inventory.push(gearToRemove);
        delete this.player.equips[slotName];

        this.player.recalcStats();
        this.player.save();
        EBus.emit('ui_equips_update');
        
        // 🌟 核心修复：卸下后保持部位筛选，刷新背包列表
        this.currentFilterSlot = slotName;
        this._renderBackpack();
        document.getElementById('item-details').style.display = 'none';
    }

    sellFromPack() {
        let g = this.modalContext.targetGear;
        // 🔒 锁定装备(pinned或locked)出售二次确认
        if (g.locked || g.pinned) {
            if (!confirm('该装备已锁定，确定出售吗？')) return;
        }
        let price = Math.max(0, (g.rarityIdx + 1) * 20) * (g.enhanceLv + 1);
        
        this.player.gold += price;
        this.player.inventory.splice(this.modalContext.index, 1);
        this.player.save();
        
        EBus.emit('ui_bars_update');
        // 🌟 核心修复：出售后保持部位筛选
        this._renderBackpack();
        document.getElementById('item-details').style.display = 'none';
    }

    batchSalvage() {
        let salvageCount = 0;
        let goldEarned = 0;
        // 🔒 一键/批量分解合并：不再固定精良，读取下拉框阈值；过滤已锁定装备
        let threshold = parseInt(document.getElementById('ui-salvage').value);
        if (threshold === -1) return alert("当前设置不会自动熔炼任何装备，请调整下拉框。");
        
        for (let i = this.player.inventory.length - 1; i >= 0; i--) {
            let g = this.player.inventory[i];
            if (g.rarityIdx <= threshold && !g.locked && !g.pinned) {
                goldEarned += Math.max(0, (g.rarityIdx + 1) * 20);
                this.player.inventory.splice(i, 1);
                salvageCount++;
            }
        }
        
        if (salvageCount > 0) {
            this.player.gold += goldEarned;
            this.player.save();
            EBus.emit('ui_bars_update');
            EBus.emit('log', `♻️ 批量清理了 ${salvageCount} 件装备，获得 ${formatNumber(goldEarned)} 金币。`, 'sys');
            this._renderBackpack();
        } else {
            alert("没有符合条件且未锁定的装备可分解。");
        }
    }

    enhanceGear() {
        let gear = this.modalContext.targetGear;
        let costNum = Math.max(100, (gear.rarityIdx + 1) * 300 * (gear.enhanceLv + 1));
        
        // 🌟 王者无敌的装备突破尽头：最高 +12 限制逻辑，避免无限膨胀与数值漏洞！
        if (gear.enhanceLv >= 12) {
            return alert('该装备已达 +12 强化上限！');
        }

        if (this.player.gold < costNum) {
            return alert('金币不足！');
        }

        this.player.gold -= costNum;
        gear.enhanceLv = (gear.enhanceLv || 0) + 1;

        // 复利神级算法：+10以后呈爆裂般指数增长！
        let powerMultiplier = 1.05 + (gear.enhanceLv * 0.03); 

        // 主属性指数增长法则保障，且严密恪守武器/防具属性的隔离带
        if (gear.slot === 'weapon') {
            gear.stats.atk = Math.floor((gear.stats.atk || 0) * powerMultiplier) + 5;
        } else if (gear.slot === 'ring' || gear.slot === 'trinket') {
            gear.stats.atk = Math.floor((gear.stats.atk || 0) * powerMultiplier) + 2;
            gear.stats.int = Math.floor((gear.stats.int || 0) * powerMultiplier) + 2;
        } else {
            gear.stats.int = Math.floor((gear.stats.int || 0) * powerMultiplier) + 5;
        }

        let affPool = ['haste', 'crit', 'versa'];
        affPool.forEach(aff => {
            if (gear.stats[aff]) {
                gear.stats[aff] += 0.5;

                // 哪怕是在神级系统强化里，也不能越过设定的暴击单件最高顶墙
                if (aff === 'crit') {
                    if (gear.slot === 'weapon') {
                        gear.stats.crit = Math.min(50, gear.stats.crit);
                    } else if (gear.slot === 'ring' || gear.slot === 'trinket') {
                        gear.stats.crit = Math.min(15, gear.stats.crit);
                    } else {
                        gear.stats.crit = Math.min(12, gear.stats.crit);
                    }
                }
                if (aff === 'haste') {
                    if (gear.slot === 'ring' || gear.slot === 'trinket') {
                        gear.stats.haste = Math.min(30, gear.stats.haste);
                    } else {
                        gear.stats.haste = Math.min(15, gear.stats.haste);
                    }
                }
                if (aff === 'versa') {
                    if (gear.slot === 'ring' || gear.slot === 'trinket') {
                        gear.stats.versa = Math.min(40, gear.stats.versa);
                    } else {
                        gear.stats.versa = Math.min(15, gear.stats.versa);
                    }
                }
            }
        });

        // 🔒 强化后重算基础评分及总分
        let s = gear.stats;
        let isA = (gear.slot === 'ring' || gear.slot === 'trinket');
        if (gear.slot === 'weapon') gear.baseScore = Math.floor((s.atk||0)*10 + (s.haste||0)*0.5 + (s.crit||0)*0.5 + (s.versa||0)*0.5);
        else if (isA) gear.baseScore = Math.floor((s.atk||0)*5 + (s.int||0)*5 + (s.haste||0)*1 + (s.crit||0)*1 + (s.versa||0)*1);
        else gear.baseScore = Math.floor((s.int||0)*10 + (s.haste||0)*0.5 + (s.crit||0)*0.5 + (s.versa||0)*0.5);
        this.player.recalcGearScore(gear);

        this.player.recalcStats();
        this.player.save();
        EBus.emit('ui_bars_update');
        EBus.emit('ui_equips_update');
        this.openGearDetail(this.modalContext.index, this.modalContext.isBody);
        EBus.emit('log', `✨ 强化成功！[${gear.name}] 提升至 +${gear.enhanceLv} 阶！`, 'sys');
    }

    // ==========================================
    // 战阵与连招技能池宏体系 UI 初始化
    // ==========================================
    initSkillPool() {
        let poolContainer = document.getElementById('ui-skill-pool');
        poolContainer.innerHTML = '';
        
        let isGMUnlocked = Storage.get('gm_unlock_all', false);

        SKILLS_DB.forEach(s => {
            // 🔒 被动技能不在技能池显示
            if (s.type === 'passive') return;
            let isLocked = !isGMUnlocked && this.player.level < s.reqLv;
            poolContainer.innerHTML += `
            <div class="skill-btn cd-mask" id="pool_${s.id}" 
                onclick="window.ui.addSkillToSequence('${s.id}')" 
                ${isLocked ? 'style="opacity:0.3;pointer-events:none"' : ''}>
                <div class="s-name">
                    ${s.name} 
                    ${isLocked ? `<span style="color:#ef4444;font-size:10px">Lv.${s.reqLv}解</span>` : ''}
                </div>
                <div style="font-size:10px;color:#a855f7">${s.type.toUpperCase()} | 耗蓝:${s.cost}</div>
                <div class="s-desc">${s.desc}</div>
            </div>`;
        });
    }

    initTabs() {
        this.currentTab = Storage.get('ui_current_tab', 'loadout_1');
        document.querySelectorAll('.tab').forEach(t => {
            t.classList.remove('active');
            if (t.dataset.tab === this.currentTab) {
                t.classList.add('active');
            }

            t.addEventListener('click', e => {
                document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
                e.target.classList.add('active');
                this.currentTab = e.target.dataset.tab;
                Storage.set('ui_current_tab', this.currentTab);
                this.loadSequenceData();
            });
        });
    }

    loadSequenceData() {
        let allLoadouts = Storage.get('loadout_sets', {});
        if (!allLoadouts[this.currentTab]) {
            allLoadouts[this.currentTab] = { ids: ['s01'], openers: [] };
        }
        this.currentLoadout = allLoadouts[this.currentTab];
        this.renderSequence();
        this.saveSequence();
    }

    renderSequence() {
        let ul = document.getElementById('sequence-list');
        ul.innerHTML = '';
        
        // 🟡 修复：渲染序列前过滤掉未解锁技能，防止存档残留
        let isGMUnlocked = Storage.get('gm_unlock_all', false);
        let needsClean = false;

        this.currentLoadout.ids = this.currentLoadout.ids.filter(id => {
            let sk = SKILLS_DB.find(x => x.id === id);
            if (!sk) return false; // 过滤无效ID或被动技能
            if (sk.type === 'passive') return false;
            if (!isGMUnlocked && this.player.level < sk.reqLv) {
                needsClean = true;
                return false;
            }
            return true;
        });

        this.currentLoadout.openers = this.currentLoadout.openers.filter(id => this.currentLoadout.ids.includes(id));

        if (needsClean) {
            this.saveSequence();
            EBus.emit('log', '⚠️ 序列中包含未解锁的技能，已被自动临时移除。', 'sys');
        }

        this.currentLoadout.ids.forEach((id, i) => {
            let sk = SKILLS_DB.find(x => x.id === id);
            if (!sk) return;
            
            let isOpener = this.currentLoadout.openers.includes(id);

            // 🌟 核心文案回归：不再是难懂的机制解释词！简简单单最强硬的最原始版本“起手”！
            ul.innerHTML += `
            <li class="seq-item" id="seq_dom_${id}">
                <div>
                    <b style="color:var(--primary)">${i + 1}.</b> 
                    ${sk.name} 
                    ${isOpener ? '<span class="opener-tag">起手</span>' : ''}
                </div>
                <div class="seq-actions">
                    <button onclick="window.ui.toggleOpener('${id}')">设为起手</button>
                    ${i > 0 ? `<button onclick="window.ui.moveSequence(${i},-1)">↑</button>` : ''}
                    ${i < this.currentLoadout.ids.length - 1 ? `<button onclick="window.ui.moveSequence(${i},1)">↓</button>` : ''}
                    <button onclick="window.ui.removeSequence(${i})" style="color:red">X</button>
                </div>
            </li>`;
        });
    }

    addSkillToSequence(id) {
        if (this.currentLoadout.ids.length >= 15) {
            return alert('循环序列过长，最大支持 15 个技能！');
        }
        if (this.currentLoadout.ids.includes(id)) {
            return alert('序列中已存在该技能！');
        }
        
        this.currentLoadout.ids.push(id);
        this.renderSequence();
        this.saveSequence();
    }

    removeSequence(index) {
        let idToRemove = this.currentLoadout.ids[index];
        this.currentLoadout.ids.splice(index, 1);
        this.currentLoadout.openers = this.currentLoadout.openers.filter(x => x !== idToRemove);
        this.renderSequence();
        this.saveSequence();
    }

    moveSequence(index, direction) {
        let temp = this.currentLoadout.ids[index];
        this.currentLoadout.ids[index] = this.currentLoadout.ids[index + direction];
        this.currentLoadout.ids[index + direction] = temp;
        this.renderSequence();
        this.saveSequence();
    }

    toggleOpener(id) {
        let idx = this.currentLoadout.openers.indexOf(id);
        if (idx > -1) {
            this.currentLoadout.openers.splice(idx, 1);
        } else {
            this.currentLoadout.openers.push(id);
        }
        this.renderSequence();
        this.saveSequence();
    }

    saveSequence() {
        let allLoadouts = Storage.get('loadout_sets', {});
        allLoadouts[this.currentTab] = this.currentLoadout;
        Storage.set('loadout_sets', allLoadouts);
        Storage.set('curr_seq_data', this.currentLoadout);
        EBus.emit('seq_updated', this.currentLoadout);
    }

    refreshAll() {
        this.initSkillPool();
        EBus.emit('ui_bars_update');
        EBus.emit('ui_stats_update', this.player);
        EBus.emit('ui_equips_update');
    }
}