// ==========================================
// 界面 UI 控制器及其交互核心
// 负责全面响应引擎的数据驱动 及事件下发
// ==========================================
import { SKILLS_DB, GEAR_RARITY, SLOTS, SLOT_NAMES, ORBS, MAX_SAME_ORB, AFFIXES } from './data.js';
import { EBus, Storage, formatNumber, GearGenerator, LootFilter } from './engine.js';

export class UIController {
    constructor(player) {
        this.player = player;
        this.bindEvents();
        this.initSkillPool();
        this.initTabs();
        this.loadSequenceData();
        
        // Modal 面板弹窗的上下文临时缓存记录器
        this.modalContext = { targetGear: null, isBody: false, index: -1 };
        this.currentFilterSlot = null;
        this.currentRefineGear = null;
        this.currentRefineList = [];
	this.currentEnhanceGear = null;
	this.currentEnhanceList = [];
	this._bindLootFilterEvents();
	// 背包排序状态：'default' | 'score_desc' | 'score_asc'
	this.backpackSortMode = Storage.get('backpack_sort_mode', 'default');
	// 批量分解模式状态
	this.batchMode = false;
	this.batchChecked = new Set();
    }

    // 🌟 全局事件统合：所有的界面状态流转都在这里监听渲染
    bindEvents() {
        EBus.on('ui_skills_update', () => {
            this.initSkillPool();
        });

        EBus.on('ui_bars_update', () => {
            document.getElementById('ui-level').innerText = `Lv.${this.player.level}`;
            
            let hpFillPCT = (Math.max(0, this.player.hp) / this.player.getMaxHp()) * 100;
            document.getElementById('ui-hp-fill').style.width = `${hpFillPCT}%`;
            
            // 采用格式化输出保证千万级血量不断层
            let currentHpFmt = formatNumber(Math.floor(Math.max(0, this.player.hp)));
            let maxHpFmt = formatNumber(this.player.getMaxHp());
            document.getElementById('ui-hp-txt').innerText = `${currentHpFmt}/${maxHpFmt}`;
            
            let mpFillPCT = (this.player.mp / this.player.getMaxMp()) * 100;
            document.getElementById('ui-mp-fill').style.width = `${mpFillPCT}%`;
            
            let currentMpFmt = formatNumber(Math.floor(this.player.mp));
            let maxMpFmt = formatNumber(this.player.getMaxMp());
            document.getElementById('ui-mp-txt').innerText = `${currentMpFmt}/${maxMpFmt}`;
            
            let maxExp = this.player.getExpReq();
            let expFillPCT = (this.player.exp / maxExp) * 100;
            document.getElementById('ui-exp-fill').style.width = `${expFillPCT}%`;
            document.getElementById('ui-exp-txt').innerText = `${expFillPCT.toFixed(1)}%`;
            
            document.getElementById('ui-gold').innerText = formatNumber(Math.floor(this.player.gold));
            
            // 🔒 移除背包容量限制：不再需要背包满红点逻辑
            this.updateInvStatus();

            // 🔒 修复：更新终焉精华数值显示
            let essenceEl = document.getElementById('ui-essence');
            if (essenceEl) essenceEl.innerText = this.player.finaleEssence || 0;
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

            // 🔒 终焉精炼按钮：获得第一件终焉装备后解锁显示
            let hasFinale = Object.values(this.player.finaleCollection).some(v => v);
            let refineBtn = document.getElementById('btn-refine');
            if (refineBtn) {
                refineBtn.style.display = hasFinale ? 'inline-block' : 'none';
            }
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

        // 🔒 扩展自动分解阈值选项：保留下拉框，补全九档品质，改用新的存储键名
        document.getElementById('ui-salvage').value = Storage.get('auto_salvage_threshold', -1);
        document.getElementById('ui-salvage').addEventListener('change', e => Storage.set('auto_salvage_threshold', e.target.value));

        document.getElementById('ui-retreat-pct').value = Storage.get('retreat_pct', 30);
        document.getElementById('ui-retreat-pct').addEventListener('change', e => Storage.set('retreat_pct', e.target.value));

        // 🔒 自动出发开关：营地血量补满后自动继续探索
        document.getElementById('ui-auto-depart').checked = Storage.get('auto_depart', false);
        document.getElementById('ui-auto-depart').addEventListener('change', e => {
            Storage.set('auto_depart', e.target.checked);
            window.engine.autoDepart = e.target.checked;
        });

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

        // 🔒 导出技能序列按钮：将当前序列导出为文本文件
        document.getElementById('btn-export-seq').addEventListener('click', () => {
            this.exportSequence();
        });

        // 🔒 导入技能序列按钮：触发隐藏的文件选择框
        document.getElementById('btn-import-seq').addEventListener('click', () => {
            document.getElementById('file-import-seq').click();
        });

        // 🔒 导入序列文件选择变更事件：读取文件内容并解析导入
        document.getElementById('file-import-seq').addEventListener('change', (e) => {
            let file = e.target.files[0];
            if (!file) return;
            let reader = new FileReader();
            reader.onload = (event) => {
                let text = event.target.result;
                if (!text || !text.trim()) {
                    alert('导入文件内容为空，请检查文件！');
                } else {
                    this.importSequence(text);
                }
            };
            reader.onerror = () => {
                alert('读取文件失败，请检查文件是否损坏！');
            };
            reader.readAsText(file);
            e.target.value = '';
        });

        // 🔒 终焉精炼按钮：打开独立模态窗口
        document.getElementById('btn-refine').addEventListener('click', () => {
            this.openRefineModal();
        });
    }

    // ==========================================
    // 万能背包系统与强化锻造界面业务
    // ==========================================
    
    // 🔒 移除背包容量限制：不再需要红点提示和满包检查
    updateInvStatus() {
        // 清空原有容量提示逻辑
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
			document.getElementById('modal-title').innerText = `🎒 装备选取 - ${SLOT_NAMES[filterSlot]}`;
		} else {
			document.getElementById('modal-title').innerText = `🎒 星盘背包 (${this.player.inventory.length})`;
		}

		this._updateSortBtnLabel();

		// 收集筛选后的装备及其原始索引
		let items = [];
		this.player.inventory.forEach((gear, i) => {
			if (filterSlot && gear.slot !== filterSlot) return;
			items.push({ gear, i });
		});

		// 按排序模式排列
		if (this.backpackSortMode === 'score_desc') {
			items.sort((a, b) => (b.gear.score || 0) - (a.gear.score || 0));
		} else if (this.backpackSortMode === 'score_asc') {
			items.sort((a, b) => (a.gear.score || 0) - (b.gear.score || 0));
		}

		if (items.length === 0) {
			area.innerHTML += `<div style='color:gray; width:100%; text-align:center; padding:20px;'>${filterSlot ? '没有找到适合该部位的装备' : '行囊空空如也...'}</div>`;
		} else {
			items.forEach(({ gear, i }) => {
				let isEquipped = !!this.player.equips[gear.slot] && this.player.equips[gear.slot] === gear;
				let cantCheck = gear.locked || gear.pinned || isEquipped;
				let cbHtml = '';
				if (this.batchMode) {
					if (cantCheck) {
						cbHtml = `<input type="checkbox" disabled style="margin-right:6px; opacity:0.3;" />`;
					} else {
						cbHtml = `<input type="checkbox" class="batch-cb" data-idx="${i}" ${this.batchChecked.has(i) ? 'checked' : ''} onchange="window.ui._toggleBatchCb(${i}, this.checked)" style="margin-right:6px;" />`;
					}
				}
				area.innerHTML += `
				<div class="inv-item" onclick="${this.batchMode ? '' : `window.ui.openGearDetail(${i}, false)`}" style="display:flex; align-items:center; ${cantCheck && this.batchMode ? 'opacity:0.5;' : ''}">
					${cbHtml}
					<div style="flex:1; cursor:pointer;">
						<div class="${GEAR_RARITY[gear.rarityIdx].color}" style="font-weight:bold;">
							${gear.name} ${gear.enhanceLv > 0 ? '+' + gear.enhanceLv : ''} ${gear.pinned ? '📌' : (gear.locked ? '🔒' : '')} ${isEquipped ? '⚔️' : ''}
						</div>
						<div style="font-size:11px; margin-top:5px; color:var(--text-mut);">总评分: ${formatNumber(gear.score)} | ${SLOT_NAMES[gear.slot]}</div>
					</div>
				</div>`;
			});
		}

		if (!this.batchMode && filterSlot) {
			area.innerHTML += `<button onclick="window.ui.openBackpack()" style="width:100%; margin-top:15px; background:transparent; border:1px dashed #666; color:#aaa; cursor:pointer; padding:5px;">↩ 显示全部装备</button>`;
		}

		this._renderModalFoot();
	}

	enterBatchMode() {
		this.batchMode = true;
		this.batchChecked = new Set();
		this._renderBackpack();
	}

	_renderModalFoot() {
		let bar = document.getElementById('modal-foot-bar');
		if (!bar) return;
		if (this.batchMode) {
			let count = this.batchChecked.size;
			let rarityOpts = GEAR_RARITY.map((r, idx) => `<option value="${idx}">${r.name}</option>`).join('');
			bar.innerHTML = `
			<select id="batch-rarity-sel" style="font-size:12px; padding:2px 4px; margin-right:6px;">${rarityOpts}</select>
			<button onclick="window.ui.batchSelectByRarity()" style="margin-right:10px; border-color:var(--border); color:var(--text-main);">全选此品质</button>
			<button onclick="window.ui.batchSelectAll()" style="margin-right:10px; border-color:var(--border); color:var(--text-main);">全选</button>
			<button onclick="window.ui.batchDoSalvage()" style="margin-right:10px; border-color:#f59e0b; color:#f59e0b;">分解所选(${count})</button>
			<button onclick="window.ui.openEnhanceView()" style="margin-right:10px; border-color:var(--accent); color:var(--accent);">⚒️ 强化锻造</button>
			<button onclick="window.ui.exitBatchMode()">取消</button>`;
		} else {
			bar.innerHTML = `
			<button onclick="window.ui.enterBatchMode()" style="margin-right:10px; border-color:#f59e0b; color:#f59e0b;">批量分解</button>
			<button onclick="window.ui.openEnhanceView()" style="margin-right:10px; border-color:var(--accent); color:var(--accent);">⚒️ 强化锻造</button>
			<button onclick="document.getElementById('modal-overlay').style.display='none'">关闭终端</button>`;
		}
	}

	exitBatchMode() {
		this.batchMode = false;
		this.batchChecked = new Set();
		this._renderBackpack();
	}

	_toggleBatchCb(idx, checked) {
		if (checked) {
			this.batchChecked.add(idx);
		} else {
			this.batchChecked.delete(idx);
		}
		this._updateBatchCount();
	}

	_updateBatchCount() {
		let count = this.batchChecked.size;
		let bar = document.getElementById('modal-foot-bar');
		if (!bar) return;
		let salvageBtn = bar.querySelector('button[onclick*="batchDoSalvage"]');
		if (salvageBtn) salvageBtn.textContent = `分解所选(${count})`;
	}

	batchSelectAll() {
		let filterSlot = this.currentFilterSlot;
		this.player.inventory.forEach((gear, i) => {
			if (filterSlot && gear.slot !== filterSlot) return;
			let isEquipped = !!this.player.equips[gear.slot] && this.player.equips[gear.slot] === gear;
			if (!gear.locked && !gear.pinned && !isEquipped) {
				this.batchChecked.add(i);
			}
		});
		this._renderBackpack();
	}

	batchSelectByRarity() {
		let sel = document.getElementById('batch-rarity-sel');
		if (!sel) return;
		let targetRarity = parseInt(sel.value);
		let filterSlot = this.currentFilterSlot;
		this.player.inventory.forEach((gear, i) => {
			if (filterSlot && gear.slot !== filterSlot) return;
			if (gear.rarityIdx !== targetRarity) return;
			let isEquipped = !!this.player.equips[gear.slot] && this.player.equips[gear.slot] === gear;
			if (!gear.locked && !gear.pinned && !isEquipped) {
				this.batchChecked.add(i);
			}
		});
		this._renderBackpack();
	}

	batchDoSalvage() {
		let count = this.batchChecked.size;
		if (count === 0) { alert('没有选中任何装备。'); return; }
		if (!confirm(`确定分解选中的 ${count} 件装备吗？此操作不可撤销。`)) return;

		let sortedIdxs = Array.from(this.batchChecked).sort((a, b) => b - a);
		for (let i of sortedIdxs) {
			let g = this.player.inventory[i];
			if (g) {
				this.player.salvageGear(g);
				this.player.inventory.splice(i, 1);
			}
		}

		EBus.emit('ui_bars_update');
		EBus.emit('log', `♻️ 批量分解了 ${count} 件装备。`, 'sys');
		this.batchMode = false;
		this.batchChecked = new Set();
		this._renderBackpack();
		document.getElementById('item-details').style.display = 'none';
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
            if (orbBonus.atk_pct) statsHtml += `攻击力: <span style="color:#a855f7">+${orbBonus.atk_pct}%</span><br>`;
        }

        // 副属性 (紧凑排版)
        if (gear.stats.crit) statsHtml += `暴击率: +${(gear.stats.crit).toFixed(1)}%${orbBonus.crit ? ` <span style="color:#a855f7">(+${orbBonus.crit}%)</span>` : ''}　`;
        if (gear.stats.haste) statsHtml += `冷却缩减: +${(gear.stats.haste).toFixed(1)}%${orbBonus.haste ? ` <span style="color:#a855f7">(+${orbBonus.haste}%)</span>` : ''}　`;
        if (gear.stats.versa) statsHtml += `共鸣: +${(gear.stats.versa).toFixed(1)}%${orbBonus.versa ? ` <span style="color:#a855f7">(+${orbBonus.versa}%)</span>` : ''}　`;
        
        // 🔒 宝珠提供的额外属性独立显示
        if (orbBonus.hp_pct) statsHtml += `　最大生命: <span style="color:#a855f7">+${orbBonus.hp_pct}%</span>`;
        if (orbBonus.finale_cd) statsHtml += `　终焉冷却: <span style="color:#a855f7">+${orbBonus.finale_cd}%</span>`;

        // 🔮 宝珠镶嵌 UI 区块
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

        // 🔒 恢复双锁按钮：普通锁(防误卖) 和 防换锁(防替换)
        let lockBtn = `<button onclick="window.ui.toggleLock()" style="border-color:#facc15;color:#facc15">${gear.locked ? '🔓 解锁' : '🔒 锁定'}</button>`;
        let pinBtn = `<button onclick="window.ui.togglePin()" style="border-color:#ff0055;color:#ff0055">${gear.pinned ? '📍 解除防换' : '📌 锁定防换'}</button>`;

        if (isEquipped) {
            actionsDiv.innerHTML = `
                ${lockBtn} ${pinBtn}
                <button onclick="window.ui.unequipGear()">👇 卸下放回背包</button>`;
        } else {
            actionsDiv.innerHTML = `
                ${lockBtn} ${pinBtn}
                <button onclick="window.ui.equipFromPack()" style="background:var(--primary);border-color:var(--primary)">
                    ✨ 穿戴 / 替换现装
                </button>
                <button onclick="window.ui.sellFromPack()" style="border-color:#facc15;color:#facc15">
                    💰 分解获得金币${gear.rarityIdx === 8 ? '与精华' : ''}
                </button>`;
        }
    }

    // 🔒 切换普通锁定状态 (防误卖)
    toggleLock() {
        let gear = this.modalContext.targetGear;
        gear.locked = !gear.locked;
        this.player.save();
        // 🔒 修复：解锁后及时刷新左侧列表，消除名字旁的旧锁图标
        this._renderBackpack();
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
        // 🔒 修复：切换防换锁后及时刷新左侧列表
        this._renderBackpack();
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
        
        // 🔒 移除背包容量限制：卸下装备直接进背包，不再判断容量
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
        
        // 🔒 修改：调用通用分解方法，支持终焉装备产出精华
        this.player.salvageGear(g);
        this.player.inventory.splice(this.modalContext.index, 1);
        
        EBus.emit('ui_bars_update');
        // 🌟 核心修复：出售后保持部位筛选
        this._renderBackpack();
        document.getElementById('item-details').style.display = 'none';
    }

	batchSalvage() {
		this.enterBatchMode();
	}

	cycleSortMode() {
		const order = ['default', 'score_desc', 'score_asc'];
		let idx = order.indexOf(this.backpackSortMode);
		this.backpackSortMode = order[(idx + 1) % order.length];
		Storage.set('backpack_sort_mode', this.backpackSortMode);
		this._renderBackpack();
	}

	_updateSortBtnLabel() {
		let btn = document.getElementById('btn-sort-backpack');
		if (!btn) return;
		const labels = { default: '默认顺序', score_desc: '评分 ↓', score_asc: '评分 ↑' };
		btn.textContent = labels[this.backpackSortMode] || '默认顺序';
	}

    // ==========================================
    // 终焉精炼系统 UI 交互区
    // ==========================================
    
    // 🔒 打开精炼模态窗口
    openRefineModal() {
        document.getElementById('refine-overlay').style.display = 'flex';
        document.getElementById('refine-details').innerHTML = '<div style="color:#aaa;text-align:center;padding:20px;">← 请选择一件终焉装备</div>';
        this.currentRefineGear = null;
        this.renderRefineList();
    }

    // 🔒 渲染左侧终焉装备列表：包含背包中以及已装备的
    // 🔒 渲染左侧终焉装备列表：包含已装备和背包中的
    renderRefineList() {
        let list = document.getElementById('refine-gear-list');
        list.innerHTML = '';
        this.currentRefineList = [];

        // 🔒 排序逻辑：已装备的终焉装备按固定槽位顺序(武器、头盔、胸甲、护腿、戒坠、遗物)顶置
        // 1. 优先收集身上穿戴的终焉装备
        SLOTS.forEach(slot => {
            let g = this.player.equips[slot];
            if (g && g.rarityIdx === 8) {
                this.currentRefineList.push(g);
            }
        });

        // 2. 其次收集背包中的终焉装备
        this.player.inventory.forEach(g => {
            if (g.rarityIdx === 8) {
                this.currentRefineList.push(g);
            }
        });

        if (this.currentRefineList.length === 0) {
            list.innerHTML = '<div style="color:#aaa;text-align:center;padding:20px;">没有终焉装备</div>';
            return;
        }

        this.currentRefineList.forEach((gear, idx) => {
            // 判断是否为身上穿戴的装备
            let isEquipped = Object.values(this.player.equips).includes(gear);
            list.innerHTML += `
            <div class="inv-item" onclick="window.ui.selectRefineGear(${idx})" style="cursor:pointer; border:1px solid var(--q8); ${isEquipped ? 'background:rgba(255,0,85,0.1);' : ''}">
                <div class="q8" style="font-weight:bold;">${isEquipped ? '[装备中] ' : ''}${gear.name} ${gear.enhanceLv > 0 ? '+' + gear.enhanceLv : ''}</div>
                <div style="font-size:11px; margin-top:5px; color:var(--text-mut);">评分: ${formatNumber(gear.score)} | ${SLOT_NAMES[gear.slot]}</div>
            </div>`;
        });
    }

    // 🔒 选中装备，右侧显示词条详情
    selectRefineGear(listIdx) {
        let gear = this.currentRefineList[listIdx];
        if (!gear) return;
        this.currentRefineGear = gear;
        
        let detailDiv = document.getElementById('refine-details');
        let html = `<div style="color:var(--q8);font-weight:bold;font-size:15px;margin-bottom:10px;">${gear.name} (精炼消耗: 3 终焉精华/次)</div>`;
        
        // 精华余额
        html += `<div style="margin-bottom:15px;">当前精华: <span style="color:#f59e0b;font-weight:bold;">${this.player.finaleEssence}</span></div>`;
        
        const affixNames = { haste: '冷却缩减', crit: '暴击率', versa: '共鸣' };
        const affixPool = ['haste', 'crit', 'versa'];
        
        affixPool.forEach(affix => {
            if (gear.stats[affix] !== undefined) {
                let currentVal = gear.stats[affix];
                let currentRefineLv = gear.refineLevels[affix] || 0;
                let cap = GearGenerator.getAffixCap(gear.slot, affix);
                let nextInc = currentRefineLv >= 15 ? 0 : GearGenerator.getRefineIncrement(currentRefineLv);
                
                // 预期提升如果超上限，则截断显示
                let actualNextInc = Math.min(nextInc, Math.max(0, cap - currentVal));
                
                html += `
                <div style="background:var(--bg-dark);padding:10px;border-radius:4px;margin-bottom:8px;border:1px solid var(--border);">
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <div>
                            <span style="font-weight:bold;color:var(--primary)">${affixNames[affix]}</span>
                            <span style="margin-left:10px;">当前: ${currentVal.toFixed(1)}%</span>
                            <span style="margin-left:10px;color:var(--text-mut);">上限: ${cap}%</span>
                        </div>
                        ${currentRefineLv >= 15 || actualNextInc <= 0 ? 
                            `<button disabled style="opacity:0.5;cursor:not-allowed;padding:4px 8px;">已满</button>` : 
                            `<button onclick="window.ui.doRefine('${affix}')" style="background:var(--accent);border-color:var(--accent);cursor:pointer;padding:4px 8px;">精炼 (+${actualNextInc.toFixed(1)}%)</button>`
                        }
                    </div>
                    <div style="font-size:12px;color:var(--text-mut);margin-top:5px;">
                        精炼次数: ${currentRefineLv} / 15
                    </div>
                </div>`;
            }
        });
        
        detailDiv.innerHTML = html;
    }

    // 🔒 执行精炼操作
    doRefine(affixKey) {
        if (!this.currentRefineGear) return;
        let result = this.player.refineAffix(this.currentRefineGear, affixKey);
        if (result) {
            EBus.emit('log', `⚗️ 精炼成功！[${this.currentRefineGear.name}] 提升了 ${result.increment.toFixed(1)}% (精炼等级: ${result.newLevel})`, 'sys');
            // 刷新精炼界面和主界面
            // 🔒 修复：即使是在身上装备精炼，也能正确找到index刷新
            this.selectRefineGear(this.currentRefineList.indexOf(this.currentRefineGear));
            EBus.emit('ui_bars_update');
            EBus.emit('ui_equips_update');
        } else {
            // 可能精华不足或已满
            if (this.player.finaleEssence < 3) {
                alert('终焉精华不足！');
            }
        }
    }

    openEnhanceView() {
        this.currentEnhanceGear = null;
        document.getElementById('enhance-overlay').style.display = 'flex';
        document.getElementById('enhance-details').innerHTML = '<div style="color:var(--text-mut);text-align:center;padding:20px;">← 请选择一件装备</div>';
        this.renderEnhanceList();
    }

    renderEnhanceList() {
        this.currentEnhanceList = [];
        let list = document.getElementById('enhance-gear-list');
        list.innerHTML = '';

        SLOTS.forEach(slot => {
            let g = this.player.equips[slot];
            if (g) {
                this.currentEnhanceList.push(g);
            }
        });

        this.player.inventory.forEach(g => {
            this.currentEnhanceList.push(g);
        });

        if (this.currentEnhanceList.length === 0) {
            list.innerHTML = '<div style="color:var(--text-mut);text-align:center;padding:20px;">没有任何装备</div>';
            return;
        }

        this.currentEnhanceList.forEach((gear, idx) => {
            let isEquipped = Object.values(this.player.equips).includes(gear);
            let isSelected = gear === this.currentEnhanceGear;
            let enhanceTag = gear.enhanceLv > 0 ? `<span style="color:var(--accent)">+${gear.enhanceLv}</span>` : '';

            list.innerHTML += `
            <div class="inv-item" onclick="window.ui.selectEnhanceGear(${idx})" style="cursor:pointer; ${isSelected ? 'border-color:var(--accent);background:rgba(255,71,133,0.1);' : ''} ${isEquipped && !isSelected ? 'background:rgba(157,114,255,0.08);' : ''}">
                <div style="font-weight:bold;" class="${GEAR_RARITY[gear.rarityIdx].color}">
                    ${isEquipped ? '<span style="color:var(--primary);font-size:10px;">[装]</span> ' : ''}${gear.name} ${enhanceTag}
                </div>
                <div style="font-size:11px; margin-top:5px; color:var(--text-mut);">评分: ${formatNumber(gear.score)} | ${SLOT_NAMES[gear.slot]}</div>
            </div>`;
        });
    }

    renderEnhanceDetail() {
        let gear = this.currentEnhanceGear;
        let detailDiv = document.getElementById('enhance-details');

        if (!gear) {
            detailDiv.innerHTML = '<div style="color:var(--text-mut);text-align:center;padding:20px;">← 请选择一件装备</div>';
            return;
        }

        let isEquipped = Object.values(this.player.equips).includes(gear);
        let isAccessory = (gear.slot === 'ring' || gear.slot === 'trinket');

        let html = `<div id="enhance-name" style="font-size:15px;font-weight:bold;margin-bottom:10px;">`;
        html += `${isEquipped ? '<span style="color:var(--primary);font-size:11px;">[装备中]</span> ' : ''}`;
        html += `<span class="${GEAR_RARITY[gear.rarityIdx].color}">${gear.name} ${gear.enhanceLv > 0 ? '+' + gear.enhanceLv : ''}</span></div>`;

        html += `<div style="font-size:12px;color:var(--text-mut);margin-bottom:10px;">`;
        html += `<b>强化等级: <span style="color:var(--accent)">${gear.enhanceLv || 0}</span> / 12</b><br>`;

        if (gear.slot === 'weapon') {
            html += `攻击力: ${formatNumber(Math.floor(gear.stats.atk || 0))}<br>`;
        } else if (isAccessory) {
            html += `攻击力: ${formatNumber(Math.floor(gear.stats.atk || 0))} | 防御力: ${formatNumber(Math.floor(gear.stats.int || 0))}<br>`;
        } else {
            html += `防御力: ${formatNumber(Math.floor(gear.stats.int || 0))}<br>`;
        }

        if (gear.stats.crit) html += `暴击率: +${gear.stats.crit.toFixed(1)}%　`;
        if (gear.stats.haste) html += `冷却缩减: +${gear.stats.haste.toFixed(1)}%　`;
        if (gear.stats.versa) html += `共鸣: +${gear.stats.versa.toFixed(1)}%　`;
        html += `</div>`;

        if (gear.enhanceLv < 12) {
            let successRate = GearGenerator.getEnhanceRate(gear);
            let cost = GearGenerator.getEnhanceCost(gear);
            let rateColor = successRate >= 70 ? '#4ade80' : successRate >= 50 ? '#f59e0b' : '#ef4444';
            let canAfford = this.player.gold >= cost;

            html += `<div style="margin-top:10px; border-top:1px dashed var(--border); padding-top:10px;">`;
            html += `成功率: <span style="color:${rateColor}; font-weight:bold; font-size:18px;">${successRate.toFixed(1)}%</span><br>`;
            html += `费用: <span style="color:#facc15; font-weight:bold; font-size:14px;">${formatNumber(cost)} G</span><br>`;
            html += `</div>`;

            html += `<div style="display:flex; gap:8px; margin-top:15px; flex-wrap:wrap;">`;
            html += `<button onclick="window.ui.doEnhance()" style="background:var(--accent);border-color:var(--accent);${canAfford ? '' : 'opacity:0.4;pointer-events:none;'}">⚒️ 强化</button>`;
            html += `<button onclick="window.ui.batchEnhance(5)" style="border-color:#f59e0b;color:#f59e0b;${canAfford ? '' : 'opacity:0.4;pointer-events:none;'}">×5</button>`;
            html += `<button onclick="window.ui.batchEnhance(10)" style="border-color:#f59e0b;color:#f59e0b;${canAfford ? '' : 'opacity:0.4;pointer-events:none;'}">×10</button>`;
            html += `<button onclick="window.ui.batchEnhance(-1)" style="border-color:#ef4444;color:#ef4444;${canAfford ? '' : 'opacity:0.4;pointer-events:none;'}">×MAX</button>`;
            html += `</div>`;
        } else {
            html += `<div style="margin-top:10px; color:var(--accent); font-weight:bold;">已达强化上限 +12</div>`;
        }

        detailDiv.innerHTML = html;
    }

    selectEnhanceGear(listIdx) {
        this.currentEnhanceGear = this.currentEnhanceList[listIdx];
        this.renderEnhanceDetail();
        this.renderEnhanceList();
    }

    doEnhance() {
        let gear = this.currentEnhanceGear;
        if (!gear || gear.enhanceLv >= 12) return;

        let result = this.player.enhanceGear(gear);

        if (result.reason === 'gold') {
            EBus.emit('log', '❌ 金币不足，无法强化！', 'err');
            return;
        }
        if (result.reason === 'max') return;

        if (result.success) {
            EBus.emit('log', `✨ 强化成功！[${gear.name}] 提升至 +${gear.enhanceLv} 阶！`, 'sys');
        } else {
            EBus.emit('log', `💔 强化失败！[${gear.name}] 仍为 +${gear.enhanceLv}，损失 ${formatNumber(result.cost)}G`, 'err');
        }

        this.flashEnhanceResult(result.success);
        EBus.emit('ui_bars_update');
        EBus.emit('ui_equips_update');
        this.renderEnhanceDetail();
        this.renderEnhanceList();
    }

    flashEnhanceResult(success) {
        let overlay = document.getElementById('enhance-overlay');
        if (!overlay) return;
        let cls = success ? 'enhance-flash-success' : 'enhance-flash-fail';
        overlay.classList.add(cls);
        setTimeout(() => overlay.classList.remove(cls), 500);
    }

    batchEnhance(target) {
        let gear = this.currentEnhanceGear;
        if (!gear || gear.enhanceLv >= 12) return;

        let attempts = 0;
        let successes = 0;
        let totalCost = 0;
        let maxAttempts = target === -1 ? 999 : target;

        while (attempts < maxAttempts) {
            if (gear.enhanceLv >= 12) break;
            let cost = GearGenerator.getEnhanceCost(gear);
            if (this.player.gold < cost) break;

            let result = this.player.enhanceGear(gear);
            attempts++;
            totalCost += result.cost;

            if (result.success) {
                successes++;
            }
            if (target === -1 && result.success) break;
        }

        if (attempts === 0) {
            if (this.player.gold < GearGenerator.getEnhanceCost(gear)) {
                EBus.emit('log', '❌ 金币不足，无法强化！', 'err');
            }
            return;
        }

        let failMsg = attempts - successes > 0 ? `，失败 ${attempts - successes} 次` : '';
        EBus.emit('log', `⚒️ 批量强化完成：尝试 ${attempts} 次，成功 ${successes} 次${failMsg}，共消耗 ${formatNumber(totalCost)}G → [${gear.name}] +${gear.enhanceLv}`, 'sys');

        this.flashEnhanceResult(successes > 0);
        EBus.emit('ui_bars_update');
        EBus.emit('ui_equips_update');
        this.renderEnhanceDetail();
        this.renderEnhanceList();
    }

    // ==========================================
    // 战阵与连招技能池宏体系 UI 初始化
    // ==========================================
    renderDynamicDesc(skill) {
        let p = this.player;
        let desc = skill.desc;
        let atk = p.stats.atk;
        let versa = p.stats.versa || 0;
        let versaMult = 1 + versa / 100;
        let dmgUp = 1 + (p.stats.dmg_up_pct || 0) / 100;

        if (desc.includes('{dmg}')) {
            let dmg = Math.floor(atk * skill.dmgMult * versaMult * dmgUp);
            desc = desc.replace('{dmg}', formatNumber(Math.max(1, dmg)));
        }
        if (desc.includes('{dmgMult}')) {
            desc = desc.replace('{dmgMult}', (skill.dmgMult * 100).toFixed(0));
        }
        if (desc.includes('{cost}')) {
            desc = desc.replace('{cost}', skill.cost);
        }
        if (desc.includes('{cd}')) {
            desc = desc.replace('{cd}', skill.cd > 0 ? (skill.cd / 1000).toFixed(1) : '0');
        }
        if (desc.includes('{dur}')) {
            let dur = 0;
            if (skill.effects && skill.effects.length > 0) {
                dur = skill.effects[0].dur || 0;
            }
            desc = desc.replace('{dur}', (dur / 1000).toFixed(0));
        }
        if (desc.includes('{dps}')) {
            let dps = 0;
            if (skill.effects) {
                let dotEff = skill.effects.find(e => e.type === 'dot');
                if (dotEff) dps = dotEff.dps || 0;
            }
            desc = desc.replace('{dps}', (dps * 100).toFixed(0));
        }
        if (desc.includes('{heal}')) {
            let healPow = Math.max(atk, p.stats.int);
            let healMult = 0;
            if (skill.effects) {
                let healEff = skill.effects.find(e => e.type === 'heal');
                if (healEff) healMult = healEff.val || 0;
            }
            let healVal = Math.floor(healPow * healMult);
            desc = desc.replace('{heal}', formatNumber(healVal));
        }
        if (desc.includes('{healMult}')) {
            let healMult = 0;
            if (skill.effects) {
                let healEff = skill.effects.find(e => e.type === 'heal');
                if (healEff) healMult = healEff.val || 0;
            }
            desc = desc.replace('{healMult}', (healMult * 100).toFixed(0));
        }
        if (desc.includes('{mpRecover}')) {
            let pct = 0;
            if (skill.effects) {
                let mpEff = skill.effects.find(e => e.type === 'mp_recover_pct');
                if (mpEff) pct = mpEff.val || 0;
            }
            desc = desc.replace('{mpRecover}', formatNumber(Math.floor(p.getMaxMp() * pct)));
        }
        if (desc.includes('{hotPerTick}')) {
            let pct = 0;
            if (skill.effects) {
                let hotEff = skill.effects.find(e => e.type === 'hot');
                if (hotEff) pct = hotEff.pct || 0;
            }
            desc = desc.replace('{hotPerTick}', formatNumber(Math.floor(p.getMaxHp() * pct)));
        }
        if (desc.includes('{shieldVal}')) {
            let hpPct = 0;
            if (skill.effects) {
                let shieldEff = skill.effects.find(e => e.type === 'shield');
                if (shieldEff) hpPct = shieldEff.hpPct || 0;
            }
            desc = desc.replace('{shieldVal}', formatNumber(Math.floor(p.getMaxHp() * hpPct)));
        }

        return desc;
    }

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
                <div class="s-desc">${this.renderDynamicDesc(s)}</div>
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
		// 旧技能ID迁移映射（Phase 4.5 重编号后兼容旧存档）
		const idMig = { 's38':'s39','s39':'s42','s40':'s44','s41':'s46','s42':'s47' };
		const migArr = arr => arr.map(id => idMig[id] || id);
		for (let tab in allLoadouts) {
			allLoadouts[tab].ids = migArr(allLoadouts[tab].ids);
			allLoadouts[tab].openers = migArr(allLoadouts[tab].openers);
		}
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

            // 🌟 核心文案回归：难懂的机制解释词消失！简简单单最强硬的最原始版本"起手"！
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

    // ==========================================
    // 🔒 技能序列导入/导出功能
    // 功能：支持将当前序列导出为文件、从文件导入序列
    // 格式：@ 开头为起手技能，其他为常规序列，# 为注释
    // ==========================================

    // 🔒 导出当前技能序列为文本文件并触发下载
    exportSequence() {
        let ids = this.currentLoadout.ids || [];
        let openers = this.currentLoadout.openers || [];
        let lines = [];

        // 🔒 起手技能：每行以 @ 开头，按 openers 数组顺序输出
        openers.forEach(id => {
            let sk = SKILLS_DB.find(s => s.id === id);
            if (sk) {
                lines.push('@ ' + sk.name);
            }
        });

        // 🔒 常规序列：每行一个技能名，排除已在起手部分输出的技能
        ids.forEach(id => {
            if (openers.includes(id)) return; // 起手技能已在上部分输出，跳过
            let sk = SKILLS_DB.find(s => s.id === id);
            if (sk) {
                lines.push(sk.name);
            }
        });

        let text = lines.join('\n');

        // 🔒 生成文件名：序列_[页签名]_[YYYYMMDD].txt
        let tabNames = { loadout_1: '练级推图循环', loadout_2: 'Boss攻坚循环', loadout_3: '自定义' };
        let tabName = tabNames[this.currentTab] || this.currentTab;
        let now = new Date();
        let dateStr = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
        let fileName = `序列_${tabName}_${dateStr}.txt`;

        // 🔒 使用 Blob 生成下载链接，触发文件下载
        let blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        let url = URL.createObjectURL(blob);
        let a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        window.engine.log(`📤 当前序列已导出为文件。（共 ${ids.length} 个技能，${openers.length} 个起手）`, 'sys');
    }

    // 🔒 解析导入文本，返回 { ids: [], openers: [] }
    // 规则：空行忽略、# 注释忽略、@ 开头为起手技能（同时加入ids）、其他为常规序列
    parseSequenceText(text) {
        let ids = [];
        let openers = [];
        let lines = text.split('\n');

        lines.forEach(line => {
            // 🔒 忽略行首尾空白字符
            let trimmed = line.trim();
            // 🔒 空行忽略
            if (!trimmed) return;
            // 🔒 以 # 开头的行视为注释，忽略
            if (trimmed.startsWith('#')) return;

            // 🔒 判断是否为起手技能
            let isOpener = false;
            let skillName = '';

            if (trimmed.startsWith('@')) {
                isOpener = true;
                // 🔒 去掉@，再trim一次，兼容"@ 技能名"和"@技能名"
                skillName = trimmed.substring(1).trim();
            } else {
                skillName = trimmed;
            }

            if (!skillName) return;

            // 🔒 在SKILLS_DB中查找匹配的技能（忽略大小写，排除被动技能）
            let matched = SKILLS_DB.filter(s =>
                s.name.toLowerCase() === skillName.toLowerCase() && s.type !== 'passive'
            );

            if (matched.length === 0) {
                // 🔒 无法匹配任何技能，日志提示并跳过
                window.engine.log(`⚠️ 无法识别技能名称：[${skillName}]，已跳过。`, 'err');
                return;
            }

            if (matched.length > 1) {
                // 🔒 同名技能警告，选取第一个
                window.engine.log(`⚠️ 发现多个同名技能 [${skillName}]，选取第一个。`, 'sys');
            }

            let skillId = matched[0].id;

            if (isOpener) {
                // 🔒 起手技能同时加入 openers 和 ids（openers 是 ids 的子集）
                openers.push(skillId);
                ids.push(skillId);
            } else {
                ids.push(skillId);
            }
        });

        return { ids, openers };
    }

    // 🔒 执行导入技能序列：解析 → 等级校验 → 去重 → 数量限制 → 保底 → 覆盖保存
    importSequence(text) {
        // 🔒 解析文本
        let parsed = this.parseSequenceText(text);
        let ids = parsed.ids;
        let openers = parsed.openers;

        // 🔒 检查是否有有效技能
        if (ids.length === 0 && openers.length === 0) {
            alert('未识别到任何有效技能名称，请检查文件格式。');
            return;
        }

        let playerLevel = this.player.level;
        let isGMUnlocked = Storage.get('gm_unlock_all', false);

        // 🔒 GM模式提示
        if (isGMUnlocked) {
            window.engine.log(`[GM] 已强制导入所有技能，无视等级限制。`, 'sys');
        }

        // 🔒 等级校验：移除未解锁的起手技能
        let filteredOpeners = [];
        openers.forEach(id => {
            let sk = SKILLS_DB.find(s => s.id === id);
            if (!sk) return;
            if (!isGMUnlocked && sk.reqLv > playerLevel) {
                window.engine.log(`⚠️ 起手技能 [${sk.name}] 未解锁，已自动移除。`, 'sys');
                // 🔒 起手技能未解锁时，也需要从ids中移除
                let idxInIds = ids.indexOf(id);
                if (idxInIds > -1) ids.splice(idxInIds, 1);
                return;
            }
            filteredOpeners.push(id);
        });

        // 🔒 等级校验：移除未解锁的常规技能
        let filteredIds = [];
        ids.forEach(id => {
            let sk = SKILLS_DB.find(s => s.id === id);
            if (!sk) return;
            // 🔒 跳过已因起手校验被移除的技能
            if (!isGMUnlocked && sk.reqLv > playerLevel) {
                window.engine.log(`⚠️ 序列中的 [${sk.name}] 未解锁，已自动跳过。`, 'sys');
                // 🔒 若该技能在openers中也存在，一并移除
                let idxInOpeners = filteredOpeners.indexOf(id);
                if (idxInOpeners > -1) filteredOpeners.splice(idxInOpeners, 1);
                return;
            }
            filteredIds.push(id);
        });

        // 🔒 去重：openers数组
        let dedupedOpeners = [];
        filteredOpeners.forEach(id => {
            if (!dedupedOpeners.includes(id)) {
                dedupedOpeners.push(id);
            } else {
                let sk = SKILLS_DB.find(s => s.id === id);
                window.engine.log(`⚠️ 起手技能 [${sk ? sk.name : id}] 重复，已自动去重。`, 'sys');
            }
        });

        // 🔒 去重：ids数组
        let dedupedIds = [];
        filteredIds.forEach(id => {
            if (!dedupedIds.includes(id)) {
                dedupedIds.push(id);
            } else {
                let sk = SKILLS_DB.find(s => s.id === id);
                window.engine.log(`⚠️ 序列中的 [${sk ? sk.name : id}] 重复，已自动去重。`, 'sys');
            }
        });

        // 🔒 数量限制：ids最多15个
        if (dedupedIds.length > 15) {
            window.engine.log(`⚠️ 常规序列超过15个技能，已自动截取前15个。`, 'sys');
            dedupedIds = dedupedIds.slice(0, 15);
        }

        // 🔒 保底处理：若过滤后ids为空
        if (dedupedIds.length === 0) {
            dedupedIds = ['s01'];
            window.engine.log(`⚠️ 所有导入技能均无效或未解锁，已自动替换为魔力弹。`, 'sys');
        }

        // 🔒 过滤openers：确保openers中的技能都在ids中（系统约束）
        dedupedOpeners = dedupedOpeners.filter(id => dedupedIds.includes(id));

        // 🔒 覆盖当前序列
        this.currentLoadout.ids = dedupedIds;
        this.currentLoadout.openers = dedupedOpeners;

        // 🔒 保存并刷新UI
        this.saveSequence();
        this.renderSequence();

        // 🔒 输出汇总日志
        window.engine.log(`📥 导入完成。常规技能: ${dedupedIds.length}，起手: ${dedupedOpeners.length}。`, 'sys');
    }

    openLootFilter() {
        document.getElementById('loot-filter-overlay').style.display = 'flex';
        this._renderLootFilter();
    }

    _bindLootFilterEvents() {
        document.querySelectorAll('.lf-preset-btn').forEach(btn => {
            btn.onclick = () => {
                let preset = btn.dataset.preset;
                if (preset === 'reset') {
                    LootFilter.resetRules();
                } else {
                    LootFilter.applyPreset(preset);
                }
                this._renderLootFilter();
            };
        });
        document.getElementById('btn-lf-save').onclick = () => {
            this._saveLootFilter();
            document.getElementById('loot-filter-overlay').style.display = 'none';
            EBus.emit('log', '🔍 拾取过滤规则已保存。', 'sys');
        };
    }

    _renderLootFilter() {
        let rules = LootFilter.loadRules();
        let body = document.getElementById('loot-filter-body');
        let html = '';

        html += this._renderLootFilterSection('全局规则', rules.global, 'global');
        SLOTS.forEach(slot => {
            let slotRule = rules.slots[slot] || { minRarity: -1, requiredAffixes: [], minAffixValues: {} };
            html += this._renderLootFilterSection(SLOT_NAMES[slot], slotRule, 'slot_' + slot);
        });

        body.innerHTML = html;

        body.querySelectorAll('.lf-section-toggle').forEach(toggle => {
            toggle.onclick = () => {
                let content = toggle.nextElementSibling;
                content.style.display = content.style.display === 'none' ? 'block' : 'none';
            };
        });
    }

    _renderLootFilterSection(title, rule, prefix) {
        let placeholderText = prefix === 'global' ? '不设品质门槛（回退到下拉框）' : '继承全局规则';
        let rarityOptions = `<option value="-1" ${rule.minRarity === -1 ? 'selected' : ''}>${placeholderText}</option>`;
        GEAR_RARITY.forEach((r, i) => {
            rarityOptions += `<option value="${i}" ${rule.minRarity === i ? 'selected' : ''}>${r.name}</option>`;
        });

        let affixChecks = '';
        AFFIXES.forEach(a => {
            let checked = rule.requiredAffixes.includes(a.id) ? 'checked' : '';
            affixChecks += `<label style="font-size:12px; cursor:pointer; display:inline-flex; align-items:center; gap:3px; margin-right:10px;">
                <input type="checkbox" class="lf-affix" data-prefix="${prefix}" data-affix="${a.id}" ${checked}> ${a.name}
            </label>`;
        });

        let affixValues = '';
        AFFIXES.forEach(a => {
            let val = rule.minAffixValues[a.id] || '';
            affixValues += `<div style="display:flex; align-items:center; gap:5px; margin-bottom:4px;">
                <span style="font-size:12px; width:60px; text-align:right;">${a.name}≥</span>
                <input type="number" class="lf-affix-val" data-prefix="${prefix}" data-affix="${a.id}" value="${val}" min="0" step="0.5" style="width:60px; background:var(--bg-dark); color:var(--text-main); border:1px solid var(--border); padding:3px; text-align:center;">
            </div>`;
        });

        return `<div class="lf-section">
            <div class="lf-section-toggle" style="cursor:pointer; padding:6px 10px; background:var(--bg-dark); border-radius:4px; margin-bottom:6px; display:flex; justify-content:space-between;">
                <span style="font-weight:bold; color:var(--primary);">${title}</span>
                <span style="color:var(--text-mut); font-size:11px;">▼ 展开</span>
            </div>
            <div class="lf-section-content" style="padding:0 10px 10px; ${prefix === 'global' ? '' : 'display:none;'}">
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
                    <span style="font-size:12px;">最低品质：</span>
                    <select class="lf-rarity" data-prefix="${prefix}" style="background:var(--bg-dark); color:var(--text-main); border:1px solid var(--border); padding:3px;">${rarityOptions}</select>
                </div>
                <div style="margin-bottom:6px;">
                    <span style="font-size:12px;">必需词条：</span>
                    ${affixChecks}
                </div>
                <div>
                    <span style="font-size:12px; display:block; margin-bottom:4px;">词条最低数值：</span>
                    ${affixValues}
                </div>
            </div>
        </div>`;
    }

    _saveLootFilter() {
        let rules = { global: { minRarity: -1, requiredAffixes: [], minAffixValues: {} }, slots: {} };

        let globalRarityEl = document.querySelector('.lf-rarity[data-prefix="global"]');
        rules.global.minRarity = parseInt(globalRarityEl.value);
        document.querySelectorAll('.lf-affix[data-prefix="global"]:checked').forEach(cb => {
            rules.global.requiredAffixes.push(cb.dataset.affix);
        });
        document.querySelectorAll('.lf-affix-val[data-prefix="global"]').forEach(inp => {
            if (inp.value && parseFloat(inp.value) > 0) {
                rules.global.minAffixValues[inp.dataset.affix] = parseFloat(inp.value);
            }
        });

        SLOTS.forEach(slot => {
            let prefix = 'slot_' + slot;
            let rarityEl = document.querySelector(`.lf-rarity[data-prefix="${prefix}"]`);
            let rarityVal = parseInt(rarityEl.value);
            let reqAffixes = [];
            document.querySelectorAll(`.lf-affix[data-prefix="${prefix}"]:checked`).forEach(cb => {
                reqAffixes.push(cb.dataset.affix);
            });
            let minVals = {};
            document.querySelectorAll(`.lf-affix-val[data-prefix="${prefix}"]`).forEach(inp => {
                if (inp.value && parseFloat(inp.value) > 0) {
                    minVals[inp.dataset.affix] = parseFloat(inp.value);
                }
            });
            if (rarityVal > -1 || reqAffixes.length > 0 || Object.keys(minVals).length > 0) {
                rules.slots[slot] = { minRarity: rarityVal, requiredAffixes: reqAffixes, minAffixValues: minVals };
            }
        });

        LootFilter.saveRules(rules);
    }
}
