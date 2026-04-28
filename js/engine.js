// ==========================================
// 末光咏叹 V3.3 - 核心逻辑引警 (防假死与数值闭环版 - 全量修复与功能补全)
// ==========================================
import { SKILLS_DB, GEAR_RARITY, SLOTS, SLOT_NAMES, ORBS, MAX_SAME_ORB, SLOT_BASE_NAMES, AFFIXES } from './data.js';

// ==========================================
// 0. 全局工具：大数值格式化工厂
// 功能：将后期动辄上亿的伤害与血量转化为 K, M, B, T，防止 UI 撑爆与数字疲劳
// ==========================================
export function formatNumber(num) {
    if (num < 1000) {
        return num.toString();
    }
    if (num < 1000000) {
        return (num / 1000).toFixed(1) + 'K';      // 千
    }
    if (num < 1000000000) {
        return (num / 1000000).toFixed(2) + 'M';   // 百万
    }
    if (num < 1000000000000) {
        return (num / 1000000000).toFixed(2) + 'B'; // 十亿
    }
    return (num / 1000000000000).toFixed(2) + 'T'; // 兆
}

// ==========================================
// 1. 基于发布订阅的 EventBus (事件总线)
// 功能：实现底层引擎与 UI 渲染的完全解耦，避免脏调用
// ==========================================
export class EventBus {
    constructor() { 
        this.events = {}; 
    }
    on(event, listener) {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        this.events[event].push(listener);
    }
    // 取消事件监听，供 Lit 组件 disconnectedCallback 中清理用
    off(event, listener) {
        if (this.events[event]) {
            this.events[event] = this.events[event].filter(fn => fn !== listener);
        }
    }
    emit(event, ...args) {
        if (this.events[event]) {
            this.events[event].forEach(fn => fn(...args));
        }
    }
}
export const EBus = new EventBus();

// 装备槽位分类工具函数
export function isAccessory(slot) { return slot === 'ring' || slot === 'pendant' || slot === 'trinket'; }
export function isArmor(slot) { return slot === 'head' || slot === 'chest' || slot === 'legs' || slot === 'feet'; }
export function isWeapon(slot) { return slot === 'weapon'; }

// ==========================================
// 1.5 进阶拾取过滤器 LootFilter
// 功能：按部位+品质+词条组合规则精确控制拾取/分解
// 优先级：部位规则 > 全局规则 > 旧版品质下拉框（兼容保留）
// ==========================================
export class LootFilter {
    static STORAGE_KEY = 'loot_filter_rules';

    static _defaultRule() {
        return { minRarity: -1, requiredAffixes: [], minAffixValues: {} };
    }

    static loadRules() {
        return Storage.get(this.STORAGE_KEY, {
            global: this._defaultRule(),
            slots: {}
        });
    }

    static saveRules(rules) {
        Storage.set(this.STORAGE_KEY, rules);
    }

    static resetRules() {
        Storage.set(this.STORAGE_KEY, {
            global: this._defaultRule(),
            slots: {}
        });
    }

    static applyPreset(presetId) {
        let rules = { global: this._defaultRule(), slots: {} };
        if (presetId === 'finale_only') {
            rules.global.minRarity = 8;
        } else if (presetId === 'high_crit_accessory') {
            rules.global.minRarity = 5;
	rules.slots.pendant = { minRarity: 5, requiredAffixes: ['crit'], minAffixValues: { crit: 5 } };
			rules.slots.ring = { minRarity: 5, requiredAffixes: ['crit'], minAffixValues: { crit: 5 } };
			rules.slots.trinket = { minRarity: 5, requiredAffixes: ['crit'], minAffixValues: { crit: 5 } };
        } else if (presetId === 'mythic_above') {
            rules.global.minRarity = 6;
        }
        this.saveRules(rules);
        return rules;
    }

    static shouldKeep(gear) {
        let rules = this.loadRules();
        let rule = rules.slots[gear.slot] || rules.global;
        if (rule.minRarity === -1 && rule.requiredAffixes.length === 0 && Object.keys(rule.minAffixValues).length === 0) {
            let autoThreshold = Storage.get('auto_salvage_threshold', -1);
            if (autoThreshold > -1 && gear.rarityIdx <= autoThreshold) return false;
            return true;
        }
        if (rule.minRarity > -1 && gear.rarityIdx < rule.minRarity) return false;
        for (let aff of rule.requiredAffixes) {
            if (!gear.stats[aff] || gear.stats[aff] <= 0) return false;
        }
        for (let aff in rule.minAffixValues) {
            if (!gear.stats[aff] || gear.stats[aff] < rule.minAffixValues[aff]) return false;
        }
        return true;
    }
}

// ==========================================
// 2. 本地持久化封装类 Storage
// 功能：统一接管 localStorage，防止异常报错和死档
// ==========================================
export class Storage {
    static get(key, defValue) {
        try {
            let val = localStorage.getItem(`mgrpg_${key}`);
            return val ? JSON.parse(val) : defValue;
        } catch(e) { 
            return defValue; 
        }
    }
    static set(key, value) {
        localStorage.setItem(`mgrpg_${key}`, JSON.stringify(value));
    }
    static clear() {
        Object.keys(localStorage).forEach(k => {
            if(k.startsWith('mgrpg_')) {
                localStorage.removeItem(k);
            }
        });
    }
}

// ==========================================
// 3. 装备词缀池与随机器 GearGenerator
// 功能：负责随层数浮动的品级判定及属性生成
// ==========================================
export class GearGenerator {
    // 🔒 计算单个宝珠提供的折算装备评分 (1%属性 ≈ 10点基础装备评分)
    static calcOrbStatAndScore(orb) {
        let scoreMult = 10;
        return { score: orb.val * scoreMult };
    }

    // 🔒 终焉精炼：线性递减权重曲线（15→1，总和120）
    static getRefineWeight(currentRefineLv) {
        return 15 - currentRefineLv;
    }

    static getRefineTotalWeight() {
        return 120;
    }

    // 🔒 终焉精炼：根据初始值与上限动态计算本次提升量（供UI预览/引擎使用）
    static getRefineIncrementDynamic(initialVal, cap, currentRefineLv) {
        if (initialVal >= cap || currentRefineLv >= 15) return 0;
        let totalGap = cap - initialVal;
        let weight = this.getRefineWeight(currentRefineLv);
        return totalGap * (weight / this.getRefineTotalWeight());
    }

    // 🔒 终焉精炼：获取副属性理论上限（按部位与词条类型区分）
	static getAffixCap(slot, affix) {
		if (isWeapon(slot)) return 40;
		if (isAccessory(slot)) {
			return affix === 'crit' ? 30 : 36;
		}
	return 24;
	}

	static getEnhanceCost(gear) {
        let baseCost = (gear.rarityIdx + 1) * 300;
        return Math.floor(baseCost * Math.pow(1.8, gear.enhanceLv || 0));
    }

    static getEnhanceRate(gear) {
        return Math.max(30, 95 - (gear.enhanceLv || 0) * 7);
    }

    // 🌟 修复：支持指定槽位生成，给 GM 终焉套装提供底层支撑，防止强行覆盖导致属性错乱
    static generate(floor, fixedRarity = -1, fixedSlot = null) {
        let rVal = Math.random() * 100;
        
        // 楼层越高，高品质装备爆率越高 (但有微小的保底)
        let bonus = Math.floor(floor / 10);
        rVal = Math.max(0, rVal - bonus);

        // 品质九档判定规则
        let rIdx = 1;
        if (fixedRarity > -1) {
            rIdx = fixedRarity;
        } else if (rVal < 0.1) {
            rIdx = 8; // 终焉
        } else if (rVal < 0.5) {
            rIdx = 7; // 圣物
        } else if (rVal < 2) {
            rIdx = 6; // 神话
        } else if (rVal < 8) {
            rIdx = 5; // 传说
        } else if (rVal < 20) {
            rIdx = 4; // 史诗
        } else if (rVal < 45) {
            rIdx = 3; // 卓越
        } else if (rVal < 75) {
            rIdx = 2; // 精良
        } else if (rVal < 85) {
            rIdx = 0; // 破损
        }

        let slot = fixedSlot || SLOTS[Math.floor(Math.random() * SLOTS.length)];
        
        // 🌟 魔法风精简命名法：品质前缀 + 空格 + 装备名词 (如：终焉 法杖、精良 咒刃)
        let slotBaseNames = SLOT_BASE_NAMES[slot];
        let baseName = slotBaseNames[Math.floor(Math.random() * slotBaseNames.length)];
        let prefix = GEAR_RARITY[rIdx].name; // 直接使用品质名作为唯一前缀

        // 压制楼层基础掉落：使用平方根平滑成长，留出强化系统质变的空间
        let floorScale = Math.max(1, Math.sqrt(floor) * 10); 
        let bg = floorScale * GEAR_RARITY[rIdx].mult;

	let gear = {
		id: 'g_' + Date.now() + Math.floor(Math.random() * 1000),
		name: `${prefix} ${baseName}`,
		slot: slot,
		rarityIdx: rIdx,
		stats: {},
		enhanceLv: 0,
		orbs: [],
		locked: rIdx === 8,
		pinned: false,
            // 🔒 终焉精炼次数记录：按副属性键名存储已精炼次数
            refineLevels: {},
            refineInitialValues: {}
	};

	let orbSlots = rIdx === 8 ? 3 : rIdx >= 5 ? 2 : rIdx >= 2 ? 1 : 0;
	gear.orbs = new Array(orbSlots).fill(null);

	if (isWeapon(slot)) {
		gear.stats.atk = Math.max(1, Math.floor(bg * 3.0));
		gear.stats.int = 0;
	} else if (isArmor(slot)) {
		gear.stats.atk = 0;
		gear.stats.int = Math.max(1, Math.floor(bg * 2.0));
        } else {
            // 戒坠与遗物：均衡发展，承担提供稀有副属性的重任
            gear.stats.atk = Math.max(1, Math.floor(bg * 0.4));
            gear.stats.int = Math.max(1, Math.floor(bg * 0.4));
        }

	// 词缀数量判定：首饰天生带更多副属性
	let accCheck = isAccessory(slot);
	let maxAff = accCheck
            ? Math.min(4, Math.max(1, rIdx - 1))  
            : Math.min(2, Math.max(0, rIdx - 2)); 

        // 分配副词缀 (暴击/冷却缩减/全能)
        const affPool = ['haste', 'crit', 'versa'];
        
        for (let i = 0; i < maxAff; i++) {
            let selectedAffix = affPool[Math.floor(Math.random() * affPool.length)];
            let addVal = 0;
            
            // 副属性词条：固定范围摇摆，彻底斩断楼层无限膨胀影响
	if (selectedAffix === 'crit') {
			if (isWeapon(slot)) {
				addVal = Math.random() * 10 + 5;
			} else if (accCheck) {
				addVal = Math.random() * 4 + 1;
			} else {
				addVal = Math.random() * 3 + 1;
			}
		} else if (selectedAffix === 'haste') {
			if (accCheck) {
				addVal = Math.random() * 8 + 3;
			} else {
				addVal = Math.random() * 4 + 1;
			}
		} else if (selectedAffix === 'versa') {
			if (accCheck) {
				addVal = Math.random() * 8 + 3;
			} else {
				addVal = Math.random() * 4 + 1;
			}
		}

		gear.stats[selectedAffix] = (gear.stats[selectedAffix] || 0) + addVal;
		// 🔒 初始化该副词条的精炼次数为0
		gear.refineLevels[selectedAffix] = 0;

		// 单件装备上限保护机制 (防止单件装备无敌)
		if (selectedAffix === 'crit') {
			if (isWeapon(slot)) {
				gear.stats.crit = Math.min(50, gear.stats.crit);
			} else if (accCheck) {
				gear.stats.crit = Math.min(15, gear.stats.crit);
			} else {
				gear.stats.crit = Math.min(12, gear.stats.crit);
			}
		}
		if (selectedAffix === 'haste') {
			gear.stats.haste = Math.min(accCheck ? 30 : 15, gear.stats.haste);
		}
		if (selectedAffix === 'versa') {
			gear.stats.versa = Math.min(accCheck ? 40 : 15, gear.stats.versa);
		}
	}

	// 装备评分权重调整：根据不同部位给予主副属性不同权重
	if (isWeapon(slot)) {
		gear.baseScore = Math.floor((gear.stats.atk || 0) * 10 + (gear.stats.haste || 0) * 0.5 + (gear.stats.crit || 0) * 0.5 + (gear.stats.versa || 0) * 0.5);
	} else if (accCheck) {
		gear.baseScore = Math.floor((gear.stats.atk || 0) * 5 + (gear.stats.int || 0) * 5 + (gear.stats.haste || 0) * 1 + (gear.stats.crit || 0) * 1 + (gear.stats.versa || 0) * 1);
        } else {
            gear.baseScore = Math.floor((gear.stats.int || 0) * 10 + (gear.stats.haste || 0) * 0.5 + (gear.stats.crit || 0) * 0.5 + (gear.stats.versa || 0) * 0.5);
        }
        gear.score = gear.baseScore; // 初始总评分等于基础评分(无宝珠)
        return gear;
    }
}

// ==========================================
// 4. 技能效果处理器映射表重构
// 功能：告别硬编码 if-else，便于后续扩展新效果
// ==========================================
const effectHandlers = {
    dot: (e, engine) => {
    e.stateName = e.stateName || 'DoT';
    e.stateEmoji = e.stateEmoji || '☠️';
    e.totalDur = e.dur;
    e.tickTimer = 0;
    engine.mob.buffs.push(e);
    return `附加[${e.stateName}] `;
  },
    vuln: (e, engine) => { engine.mob.buffs.push(e); return '附加[暗系减益] '; },
    buff: (e, engine) => { engine.player.buffs.push(e); engine.player.recalcStats(); return '获得[光能强化] '; },
    heal: (e, engine) => {
        let healPow = Math.max(engine.player.stats.atk, engine.player.stats.int);
        let v = Math.floor(healPow * e.val);
        engine.player.hp = Math.min(engine.player.getMaxHp(), engine.player.hp + v);
        return `<span class="log-heal">生命拉回 ${formatNumber(v)}</span> `;
    },
    mp_recover: (e, engine) => {
        engine.player.mp = Math.min(engine.player.getMaxMp(), engine.player.mp + e.val);
        return `魔力回涌 ${e.val} `;
    },
    mp_recover_pct: (e, engine) => {
        let recoverVal = Math.floor(engine.player.getMaxMp() * e.val);
        engine.player.mp = Math.min(engine.player.getMaxMp(), engine.player.mp + recoverVal);
        return `魔力回涌 ${formatNumber(recoverVal)} `;
    },
    hot: (e, engine) => {
        engine.player.buffs.push({ type: 'hot', pct: e.pct, dur: e.dur, tickTimer: 0 });
        return '获得[持续恢复] ';
    },
	shield: (e, engine) => {
		let shieldVal = Math.floor(engine.player.getMaxHp() * (e.hpPct || 0));
		engine.player.buffs.push({ type: 'shield', val: shieldVal, dur: e.dur || 10000 });
		return `升起法力壁垒(吸收${formatNumber(shieldVal)}) `;
	},
	cd_reset: (e, engine) => {
		engine.skills.forEach(sk => { if (!sk.isFinale) sk.currentCd = 0; });
		return '⏱️ 时间回溯！重置所有常规技能冷却！ ';
	},
	hp_sacrifice: (e, engine) => {
		let hpCost = Math.floor(engine.player.hp * e.costPct);
		engine.player.hp = Math.max(1, engine.player.hp - hpCost);
		let v = 1.0;
		engine.mob.buffs.forEach(b => { if (b.type === 'vuln') v *= b.val; });
		let dmg = hpCost * e.dmgMult * (1 + (engine.player.stats.versa || 0) / 100) * v * (1 + (engine.player.stats.dmg_up_pct || 0) / 100);
		dmg = Math.max(1, Math.floor(dmg));
		engine.mob.hp -= dmg;
		engine.player.buffs.push({ type: 'buff', stat: 'dmg_up_pct', val: 30, dur: 10000 });
		engine.player.recalcStats();
		return `💀 灵魂献祭！消耗 ${formatNumber(hpCost)} HP，造成 ${formatNumber(dmg)} 伤害 `;
	},
  channel_immune: (e, engine) => {
    engine.player.buffs.push({ type: 'channel_immune', dur: e.dur });
    return '☄️ 星辰坠落！进入无敌持续轰击状态！ ';
  },
	cond_full_heal: (e, engine) => {
		engine.player.hp = engine.player.getMaxHp();
		engine.player.mp = engine.player.getMaxMp();
		engine.player.buffs.push({ type: 'buff', stat: 'dmg_up_pct', val: 50, dur: 15000 });
		engine.player.recalcStats();
		return '🔮 命运逆转！生命与法力完全恢复！ ';
	},
	dot_enhance: (e, engine) => {
		engine.player.buffs.push({ type: 'dot_enhance', dur: e.dur });
		return '🌀 虚空化身！持续伤害大幅增强！ ';
	}
};

// ==========================================
// 5. 技能运行时模型
// 功能：管理单个技能的 CD 和可用状态查询
// 修复：支持终焉冷却缩减机制判定
// ==========================================
export class Skill {
    constructor(data) {
        Object.assign(this, data);
        this.currentCd = 0;
        // 识别是否为终焉系列技能，受终焉冷却宝珠影响
        this.isFinale = data.desc ? data.desc.includes('[终焉]') : false;
    }
    update(dt) {
        // CD 正常转动，不会陷入负数
        if (this.currentCd > 0) {
            this.currentCd = Math.max(0, this.currentCd - dt);
        }
    }
    isReady(mp) {
        return this.currentCd <= 0 && mp >= this.cost;
    }
    startCD(finaleCdReduction = 0) {
        // 终焉技能受专属冷却缩减影响，普通技能不受影响
        if (this.isFinale) {
            this.currentCd = this.cd * (1 - finaleCdReduction / 100);
        } else {
            this.currentCd = this.cd;
        }
    }
}

// ==========================================
// 6. 战斗实体：Player & Monster 类
// ==========================================
export class Player {
    constructor() {
        this.load();
    }
    
    // 初始化与持久化层读取
    load() {
        let d = Storage.get('player_data', {});
        this.level = d.level || 1;
        this.exp = d.exp || 0;
        this.gold = d.gold || 0;
        this.equips = d.equips || {};
        this.inventory = d.inventory || [];
        this.maxFloor = d.maxFloor || 1;
	this.orbs = d.orbs || {};
		let defaultCollection = {};
		SLOTS.forEach(s => defaultCollection[s] = false);
		this.finaleCollection = d.finaleCollection || defaultCollection;
		SLOTS.forEach(s => { if (this.finaleCollection[s] === undefined) this.finaleCollection[s] = false; });
		this.finaleEssence = d.finaleEssence || 0;
        
        // 修正：战斗中存读档时必须先初始化空的BUFF和宝珠加成，否则重算属性会报错
        this.buffs = []; 
        this.orbBonus = { hp_pct: 0, atk_pct: 0, versa: 0, crit: 0, finale_cd: 0 };
        
        // 🔒 兼容旧版装备缺失字段：彻底修复自动替换因 undefined 比较失效的Bug
        this.inventory.forEach(g => { 
            if (g.locked === undefined) g.locked = false; 
            if (g.pinned === undefined) g.pinned = false; 
            if (g.baseScore === undefined) g.baseScore = g.score || 0; 
            if (g.refineLevels === undefined) g.refineLevels = {};
            if (g.refineInitialValues === undefined) g.refineInitialValues = {};
        });
	for (let k in this.equips) {
		if (this.equips[k]) {
			if (this.equips[k].locked === undefined) this.equips[k].locked = false;
			if (this.equips[k].pinned === undefined) this.equips[k].pinned = false;
			if (this.equips[k].baseScore === undefined) this.equips[k].baseScore = this.equips[k].score || 0;
			if (this.equips[k].refineLevels === undefined) this.equips[k].refineLevels = {};
			if (this.equips[k].refineInitialValues === undefined) this.equips[k].refineInitialValues = {};
		}
	}

	this._migrateGearOrbs();
        
        this.recalcStats();
        
        // 属性结算完毕后才能获取正确的 HP MP 上限
	this.hp = d.hp || this.getMaxHp();
		this.mp = d.mp || this.getMaxMp();
	}

	_migrateGearOrbs() {
		let allGears = [...Object.values(this.equips).filter(Boolean), ...this.inventory];
		allGears.forEach(gear => {
			if (!gear.orbs) gear.orbs = [];
			let expected = 0;
			if (gear.rarityIdx === 8) expected = 3;
			else if (gear.rarityIdx >= 5) expected = 2;
			else if (gear.rarityIdx >= 2) expected = 1;
			while (gear.orbs.length < expected) gear.orbs.push(null);
			if (gear.orbs.length > expected) gear.orbs = gear.orbs.slice(0, expected);
		});
	}

	save() {
        Storage.set('player_data', {
            level: this.level, 
            exp: this.exp, 
            gold: this.gold,
            equips: this.equips, 
            inventory: this.inventory, 
            maxFloor: this.maxFloor,
            orbs: this.orbs,
            finaleCollection: this.finaleCollection,
            finaleEssence: this.finaleEssence, // 🔒 终焉精华参与存档
            hp: this.hp,
            mp: this.mp
        });
    }

    // 生命值纯靠玩家等级支撑，坚决拒绝防御力撑爆血量！
    // 全等级血量成长与怪物伤害匹配问题修复：分段提高成长值，且受宝珠百分比加成
    getMaxHp() { 
        let base;
        if (this.level <= 50) {
            base = Math.floor(150 + this.level * 175);
        } else if (this.level <= 100) {
            base = Math.floor(150 + 50 * 175 + (this.level - 50) * 320);
        } else {
            base = Math.floor(150 + 50 * 175 + 50 * 320 + (this.level - 100) * 5400);
        }
        let hpPctBonus = this.orbBonus ? (this.orbBonus.hp_pct || 0) : 0;
	// 终焉图鉴加成：集齐8件最大生命值+10%
        let collectionBonus = Object.values(this.finaleCollection).every(v => v) ? 0.1 : 0;
        return Math.floor(base * (1 + hpPctBonus / 100) * (1 + collectionBonus));
    }
    
    getMaxMp() { 
        return 50 + this.level * 10; 
    }
    
    // 🟡 修复：绝望的经验成长曲线调整：100级后底数1.25改为1.15，防止升级绝对停滞
    getExpReq() { 
        let base = 100;
        if (this.level < 60) {
            return Math.floor(base * Math.pow(1.15, this.level - 1));
        } else if (this.level < 100) {
            return Math.floor(base * 100 * Math.pow(1.20, this.level - 60));
        } else {
            return Math.floor(base * 5000 * Math.pow(1.15, this.level - 100));
        }
    }

    // 宝珠镶嵌加成统算
    calcOrbBonus() {
        this.orbBonus = { hp_pct: 0, atk_pct: 0, versa: 0, crit: 0, finale_cd: 0 };
        let orbCounts = {};
        for (let key in this.equips) {
            let gear = this.equips[key];
            if (gear && gear.orbs) {
                gear.orbs.forEach(oid => {
                    if (oid) {
                        orbCounts[oid] = (orbCounts[oid] || 0) + 1;
                    }
                });
            }
        }
        for (let id in orbCounts) {
            let orb = ORBS.find(o => o.id === id);
            if (orb) {
                // 受全局最多镶嵌3个同类宝珠的限制
                let activeCount = Math.min(orbCounts[id], MAX_SAME_ORB);
                this.orbBonus[orb.stat] = (this.orbBonus[orb.stat] || 0) + (orb.val * activeCount);
            }
        }
    }

    // 🔒 获取单件装备上所有宝珠提供的属性汇总 (供UI显示词条增量)
    getGearOrbBonus(gear) {
        let bonus = {};
        if (gear.orbs) {
            gear.orbs.forEach(oid => {
                if (oid) {
                    let orb = ORBS.find(o => o.id === oid);
                    if (orb) {
                        bonus[orb.stat] = (bonus[orb.stat] || 0) + orb.val;
                    }
                }
            });
        }
        return bonus;
    }

    // 🔒 重算单件装备总评分 (基础评分 + 宝珠折算评分)
    recalcGearScore(gear) {
        let orbScore = 0;
        if (gear.orbs) {
            gear.orbs.forEach(oid => {
                if (oid) {
                    let orb = ORBS.find(o => o.id === oid);
                    if (orb) {
                        orbScore += GearGenerator.calcOrbStatAndScore(orb).score;
                    }
                }
            });
        }
        gear.score = (gear.baseScore || 0) + orbScore;
    }

    // 更新角色面板状态 (含大量硬件级硬上限)
    recalcStats() {
        // 基础裸体属性
        this.stats = { 
            atk: 10 + this.level * 2, 
            int: 10 + this.level, 
            haste: 0, 
            crit: 5, 
            versa: 0,
            finale_cd: 0,
            // 🔒 终焉被动技能：增伤10%，减伤10%
            dmg_up_pct: 0, 
            dmg_down_pct: 0
        };

        // 收集各部位词条，防止个别部位通过强化导致属性崩坏
        let weaponCrit = 0;
        let armorCrit = 0;
        let accessoryCrit = 0; 
        let totalHaste = 0;
        let totalVersa = 0;

        // 🔒 终焉被动判定：只要穿戴任意一件终焉装备即激活
        let hasFinaleEquip = false;

        for (let key in this.equips) {
            let gear = this.equips[key];
            if (!gear || !gear.stats) continue;
            if (gear.rarityIdx === 8) hasFinaleEquip = true;

	let slot = gear.slot;

		for (let s in gear.stats) {
			let val = gear.stats[s];
			if (s === 'crit') {
				if (isWeapon(slot)) {
					weaponCrit += val;
				} else if (isArmor(slot)) {
					armorCrit += val;
				} else if (isAccessory(slot)) {
					accessoryCrit += val;
				}
			} else if (s === 'haste') {
                    totalHaste += val;
                } else if (s === 'versa') {
                    totalVersa += val;
                } else {
                    this.stats[s] += val;
                }
            }
        }

        if (hasFinaleEquip) {
            this.stats.dmg_up_pct += 10;
            this.stats.dmg_down_pct += 10;
        }

	// 全局硬件暴击统筹叠加：武器最高50 + 防具最高30 + 首饰最高20 = 合计最高 100
        this.stats.crit += Math.min(50, weaponCrit) + Math.min(30, armorCrit) + Math.min(20, accessoryCrit);
        this.stats.haste += Math.min(80, totalHaste);
        this.stats.versa += Math.min(150, totalVersa);

        // 宝珠镶嵌系统：固定百分比数值加成，跨越装备上限
        this.calcOrbBonus();
        this.stats.atk = Math.floor(this.stats.atk * (1 + (this.orbBonus.atk_pct || 0) / 100));
        this.stats.crit += (this.orbBonus.crit || 0);
        this.stats.versa += (this.orbBonus.versa || 0);
        this.stats.finale_cd += (this.orbBonus.finale_cd || 0);

        // 🔒 终焉图鉴加成：攻击力+10%
        if (Object.values(this.finaleCollection).every(v => v)) {
            this.stats.atk = Math.floor(this.stats.atk * 1.1);
        }

        // 终极自由：技能提供的临时 Buff（如狂暴之心）可跨越一切上限限制！
        this.buffs.forEach(b => {
            if (b.type === 'buff' && this.stats[b.stat] !== undefined) {
                this.stats[b.stat] += b.val;
            }
        });

        EBus.emit('ui_stats_update', this);
    }

    addExp(val) {
        this.exp += val;
        let req = this.getExpReq();
        let leveledUp = false;
        
        while (this.exp >= req) {
            this.exp -= req;
            this.level++;
            req = this.getExpReq();
            leveledUp = true;
        }
        
        if (leveledUp) {
            EBus.emit('log', `🌟 莉莉丝突破了！当前位阶 Lv.${this.level}`, 'sys');
            this.recalcStats();
            this.hp = this.getMaxHp();
            this.mp = this.getMaxMp();
            EBus.emit('ui_skills_update');
        }
        
        EBus.emit('ui_bars_update');
        this.save();
    }

    // 🔒 通用分解方法：获得金币，终焉装备额外获得精华
    salvageGear(gear) {
        let salvageVal = (gear.rarityIdx + 1) * this.level * 8;
        this.gold += salvageVal;
        // 🔒 分解终焉装备时，精华直接累加
        if (gear.rarityIdx === 8) {
            this.finaleEssence += 1;
        }
        this.save();
        return salvageVal;
    }

    // 🔒 终焉精炼：消耗精华提升指定副属性，智能曲线动态计算提升量
    refineAffix(gear, affixKey) {
        if (!gear.refineLevels) gear.refineLevels = {};
        if (!gear.refineInitialValues) gear.refineInitialValues = {};
        if (gear.refineLevels[affixKey] === undefined) gear.refineLevels[affixKey] = 0;
        let currentLv = gear.refineLevels[affixKey];
        if (currentLv >= 15) return null;
        if (this.finaleEssence < 3) return null;

        let cap = GearGenerator.getAffixCap(gear.slot, affixKey);
        let currentVal = gear.stats[affixKey] || 0;

        // 首次精炼时记录该词条初始值，作为动态曲线的计算基准
        if (gear.refineInitialValues[affixKey] === undefined) {
            gear.refineInitialValues[affixKey] = currentVal;
        }
        let initialVal = gear.refineInitialValues[affixKey];

        // 初始值已到达或超过上限，无法精炼
        if (initialVal >= cap) return null;

        // 最后一次精炼直接补齐到上限，消除浮点累积误差
        if (currentLv + 1 >= 15) {
            let neededToCap = cap - currentVal;
            if (neededToCap <= 0) return null;
            this.finaleEssence -= 3;
            gear.stats[affixKey] = cap;
            gear.refineLevels[affixKey] = 15;
            let s = gear.stats;
            if (isWeapon(gear.slot)) gear.baseScore = Math.floor((s.atk||0)*10 + (s.haste||0)*0.5 + (s.crit||0)*0.5 + (s.versa||0)*0.5);
            else if (isAccessory(gear.slot)) gear.baseScore = Math.floor((s.atk||0)*5 + (s.int||0)*5 + (s.haste||0)*1 + (s.crit||0)*1 + (s.versa||0)*1);
            else gear.baseScore = Math.floor((s.int||0)*10 + (s.haste||0)*0.5 + (s.crit||0)*0.5 + (s.versa||0)*0.5);
            this.recalcGearScore(gear);
            this.recalcStats();
            this.save();
            return { increment: neededToCap, newLevel: 15 };
        }

        let increment = GearGenerator.getRefineIncrementDynamic(initialVal, cap, currentLv);
        let actualInc = Math.min(increment, Math.max(0, cap - currentVal));
        if (actualInc <= 0) return null;

        this.finaleEssence -= 3;
        gear.stats[affixKey] = currentVal + actualInc;
        gear.refineLevels[affixKey] = currentLv + 1;
        
	let s = gear.stats;
	if (isWeapon(gear.slot)) gear.baseScore = Math.floor((s.atk||0)*10 + (s.haste||0)*0.5 + (s.crit||0)*0.5 + (s.versa||0)*0.5);
	else if (isAccessory(gear.slot)) gear.baseScore = Math.floor((s.atk||0)*5 + (s.int||0)*5 + (s.haste||0)*1 + (s.crit||0)*1 + (s.versa||0)*1);
	else gear.baseScore = Math.floor((s.int||0)*10 + (s.haste||0)*0.5 + (s.crit||0)*0.5 + (s.versa||0)*0.5);
        
        this.recalcGearScore(gear);
        this.recalcStats();
        this.save();
        return { increment: actualInc, newLevel: currentLv + 1 };
    }

    enhanceGear(gear) {
        if (gear.enhanceLv >= 12) return { success: false, reason: 'max' };

        let baseCost = (gear.rarityIdx + 1) * 300;
        let cost = Math.floor(baseCost * Math.pow(1.8, gear.enhanceLv));
        if (this.gold < cost) return { success: false, reason: 'gold' };

        let successRate = Math.max(30, 95 - gear.enhanceLv * 7);
        let roll = Math.random() * 100;
        let isSuccess = roll < successRate;

        this.gold -= cost;

        if (isSuccess) {
            gear.enhanceLv = (gear.enhanceLv || 0) + 1;

            let powerMultiplier = 1.05 + (gear.enhanceLv * 0.03);

		if (isWeapon(gear.slot)) {
			gear.stats.atk = Math.floor((gear.stats.atk || 0) * powerMultiplier) + 5;
		} else if (isAccessory(gear.slot)) {
			gear.stats.atk = Math.floor((gear.stats.atk || 0) * powerMultiplier) + 2;
			gear.stats.int = Math.floor((gear.stats.int || 0) * powerMultiplier) + 2;
		} else {
			gear.stats.int = Math.floor((gear.stats.int || 0) * powerMultiplier) + 5;
		}

		let affPool = ['haste', 'crit', 'versa'];
		affPool.forEach(aff => {
			if (gear.stats[aff]) {
				gear.stats[aff] += 0.5;

				if (aff === 'crit') {
					if (isWeapon(gear.slot)) {
						gear.stats.crit = Math.min(50, gear.stats.crit);
					} else if (isAccessory(gear.slot)) {
						gear.stats.crit = Math.min(15, gear.stats.crit);
					} else {
						gear.stats.crit = Math.min(12, gear.stats.crit);
					}
				}
				if (aff === 'haste') {
					gear.stats.haste = Math.min(isAccessory(gear.slot) ? 30 : 15, gear.stats.haste);
				}
				if (aff === 'versa') {
					gear.stats.versa = Math.min(isAccessory(gear.slot) ? 40 : 15, gear.stats.versa);
				}
			}
		});

		let s = gear.stats;
		if (isWeapon(gear.slot)) gear.baseScore = Math.floor((s.atk||0)*10 + (s.haste||0)*0.5 + (s.crit||0)*0.5 + (s.versa||0)*0.5);
		else if (isAccessory(gear.slot)) gear.baseScore = Math.floor((s.atk||0)*5 + (s.int||0)*5 + (s.haste||0)*1 + (s.crit||0)*1 + (s.versa||0)*1);
		else gear.baseScore = Math.floor((s.int||0)*10 + (s.haste||0)*0.5 + (s.crit||0)*0.5 + (s.versa||0)*0.5);
            this.recalcGearScore(gear);

            this.recalcStats();
        }

        this.save();
        return { success: isSuccess, cost, successRate };
    }

    lootItem(gear) {
        // 🔒 最高优先级：进阶过滤规则，不通过的装备直接分解
        if (!LootFilter.shouldKeep(gear)) {
            let salvageVal = this.salvageGear(gear);
            let essenceLog = gear.rarityIdx === 8 ? '，获得 1 终焉精华' : '';
            EBus.emit('log', `♻️ 自动熔炼了 <span class="${GEAR_RARITY[gear.rarityIdx].color}">[${gear.name}]</span>，获得 ${formatNumber(salvageVal)} G${essenceLog}`, 'sys');
            EBus.emit('ui_bars_update');
            return;
        }

        // 🔒 通过过滤后，自动替换逻辑
        let currentEquip = this.equips[gear.slot];
        if (!currentEquip || (gear.score > (currentEquip.score || 0) && !currentEquip.pinned)) {
            let oldGear = this.equips[gear.slot];
            this.equips[gear.slot] = gear;
            // 🔒 自动锁定终焉装备(防出售)
            if (gear.rarityIdx === 8) gear.locked = true;
            
            this.recalcStats();
            
            // 🔒 记录图鉴
            if (gear.rarityIdx === 8 && !this.finaleCollection[gear.slot]) {
                this.finaleCollection[gear.slot] = true;
                EBus.emit('sys_message', `📖 终焉图鉴更新：收集到 [${SLOT_NAMES[gear.slot]}]`);
            }
            
            let logMsg = `✨ 自动装备：穿戴 <span class="${GEAR_RARITY[gear.rarityIdx].color}">[${gear.name}]</span>`;
            if (oldGear) {
                // 🔒 移除背包容量限制：替换下的旧装备直接进背包
                this.inventory.push(oldGear);
                logMsg = `🔄 自动替换：穿戴 <span class="${GEAR_RARITY[gear.rarityIdx].color}">[${gear.name}]</span>，旧装备进背包`;
            }
            EBus.emit('log', logMsg, 'sys');
            EBus.emit('sys_message', logMsg.replace(/<[^>]+>/g, '')); // 纯文本给右上角弹窗
            
            this.save();
            EBus.emit('ui_equips_update');
            return;
        }

        // 🔒 移除背包容量限制：掉落装备直接进背包
        this.inventory.push(gear);
        EBus.emit('log', `📦 战利品掉落：<span class="${GEAR_RARITY[gear.rarityIdx].color}">[${gear.name}]</span>`, 'loot');
        // 🔒 记录图鉴与自动锁定
        if (gear.rarityIdx === 8) {
            if (!this.finaleCollection[gear.slot]) {
                this.finaleCollection[gear.slot] = true;
                EBus.emit('sys_message', `📖 终焉图鉴更新：收集到 [${SLOT_NAMES[gear.slot]}]`);
            }
            gear.locked = true;
        }
        this.save();
    }
}

export class Monster {
    constructor(playerLevel, floor, isBoss) {
        // 动态等级：强敌等级 = 你当前等级 ± 5，保证你在任意楼层都会遭遇肉鸽波动的生死博弈
        let fluctuation = Math.floor(Math.random() * 11) - 5;
        this.level = Math.max(1, playerLevel + fluctuation);
        this.isBoss = isBoss;

        let names = ["异界聚合体", "深空魔晶", "虚空猎犬", "暗影游荡者"];
        this.name = isBoss
            ? `👿 【领主】第${floor}层守卫者·Lv${this.level}`
            : `${names[Math.floor(Math.random() * names.length)]}·Lv${this.level}`;

        // 怪物高楼层数值防崩塌策略：引入楼层作为指数底数，不惧玩家神装
        let hpFloorMultiplier = Math.pow(floor, 1.4); 
        let baseHPScale = 50 + (Math.pow(this.level, 1.8) * 2) + Math.floor(this.level * hpFloorMultiplier * 0.8);
        this.maxHp = Math.floor(isBoss ? baseHPScale * 6 : baseHPScale);
        this.hp = this.maxHp;

        let atkFloorMultiplier = Math.pow(floor, 1.3);
        let baseAtkScale = 20 + (this.level * 10) + (Math.pow(this.level, 1.5) * 1.5) + Math.floor(this.level * atkFloorMultiplier * 0.5);
        this.atk = Math.floor(isBoss ? baseAtkScale * 2 : baseAtkScale);
        
        this.attackSpeed = isBoss ? 2000 : 2500;
        this.attackTimer = 0;
        this.buffs = [];
    }
}

// ==========================================
// 7. CombatEngine (战斗防假挂机循环主引擎 - 全量修复)
// ==========================================
export class CombatEngine {
    constructor(player) {
        this.player = player;
        // 把数据转换为可跟踪 CD 的运行时状态
        this.skills = SKILLS_DB.map(s => new Skill(s));
		this.sequence = Storage.get('curr_seq_data', { ids: [], openers: [] });
		// 旧技能ID迁移映射（Phase 4.5 重编号后兼容旧存档）
		const idMigration = { 's38':'s39','s39':'s42','s40':'s44','s41':'s46','s42':'s47' };
		const migrateIds = arr => arr.map(id => idMigration[id] || id);
		this.sequence.ids = migrateIds(this.sequence.ids);
		this.sequence.openers = migrateIds(this.sequence.openers);

        let savedFloor = Storage.get('engine_floor', 1);
        this.floor = this.getFloorAfterRetreat(savedFloor);
        this.state = 'camp';
        this.paused = false;
        this.autoDepart = Storage.get('auto_depart', false);

        // requestAnimationFrame 驱动，100ms 一次 tick 判定
        this.lastTime = performance.now();
        this.tickRateMs = 100;
        this.timeScale = 1;
        
        // 公共冷却控制
        this.baseGCD = 2500;
        this.gcdRemaining = 0;
        
        // 关键序列指针：控制起手和循环
        this.openerPhase = true;
        this.seqIdx = 0;
        this.logs = [];

        this.loop = this.loop.bind(this);
        requestAnimationFrame(this.loop);

        EBus.on('seq_updated', data => {
            this.sequence = data;
            this.openerPhase = true;
            this.seqIdx = 0;
        });
        EBus.on('speed_changed', spd => { 
            this.timeScale = spd; 
        });
        EBus.on('god_mode', v => { 
            this.godMode = v; 
        });

        setTimeout(() => this.updateMapUI(), 500);
    }

    // 🔒 战斗日志增量追加：改为发射单条追加事件，避免全量重绘
    log(msg, type = 'sys') {
        let timeStr = new Date().toTimeString().split(' ')[0];
        let htmlStr = `<div class="log-item"><span style="color:#666">[${timeStr}]</span> <span class="log-${type}">${msg}</span></div>`;
        this.logs.push(htmlStr);
        // 战斗日志维持最高200条缓存
        if (this.logs.length > 200) {
            this.logs.shift();
        }
        EBus.emit('log_append', htmlStr);
    }

    // 撤退惩罚机制：战败永远退回附近的前一个安全营地
    getFloorAfterRetreat(f) {
        if (f <= 5) {
            return 1;
        }
        return Math.floor((f - 1) / 5) * 5 + 1;
    }

    getCampName(f) {
        if (f <= 5) {
            return 1;
        }
        return Math.floor((f - 1) / 5) * 5;
    }

    // 核心心跳循环：仅负责时间累加和状态安全过滤
    loop(currentTime) {
        requestAnimationFrame(this.loop);
        if (this.paused) {
            this.lastTime = currentTime;
            return;
        }
        
        let deltaTime = (currentTime - this.lastTime) * this.timeScale;
        if (deltaTime >= this.tickRateMs) {
            try {
                this.tick(deltaTime);
                this.lastTime = currentTime;
            } catch(err) {
                this.log(`🚨 引擎运算崩溃: ${err.message}`, 'err');
                console.error(err);
                this.paused = true;
            }
        }
    }

    startExplore() {
        if (this.state === 'combat') {
            return;
        }
        this.state = 'combat';
        this.spawnMob();
        this.log(`⚔️ 离开营地，向第 ${this.floor} 层进发！`, 'sys');
    }

    triggerRetreat(isManual) {
        if (this.state === 'camp') {
            return;
        }
        this.state = 'camp';
        this.floor = this.getFloorAfterRetreat(this.floor);
        this.player.save();
        Storage.set('engine_floor', this.floor);
        this.updateMapUI();
        document.getElementById('mob-area').style.display = 'none';
        
        let campName = this.getCampName(this.floor);
        if (isManual) {
            this.log(`🏃 紧急撤离！已安全退回星盘营地(第${campName}层)。`, 'sys');
        } else {
            this.log(`⚠️ 自动防暴毙触发！已携带物资安全撤回营地(第${campName}层)。`, 'sys');
        }
    }

    die() {
        this.state = 'camp';
        this.floor = this.getFloorAfterRetreat(this.floor);
        this.player.hp = 1; // 仅存一口气逃回营地
        this.player.save();
        Storage.set('engine_floor', this.floor);
        this.updateMapUI();
        document.getElementById('mob-area').style.display = 'none';
        
        let campName = this.getCampName(this.floor);
        this.log(`🛑 重伤倒地！救援无人机将你运回了营地(第${campName}层)。`, 'err');
    }

    // 每次遇到新怪，进行严格重置
    spawnMob() {
        let isBoss = (this.floor % 10 === 0);
        this.mob = new Monster(this.player.level, this.floor, isBoss);
        
        // 核心修复：遇到新怪彻底还原序列轴，永远从头开始放起手技！
        this.openerPhase = true;
        this.seqIdx = 0;
        
        document.getElementById('mob-area').style.display = 'flex';
        EBus.emit('ui_monster_update', this.mob);
        this.updateMapUI();
    }

    // 全息地图节点生成渲染
    updateMapUI() {
        let campName = this.getCampName(this.floor);
        let htmlStr = `<div class="map-node camp ${this.state === 'camp' ? 'active' : ''}">[营地${campName}]</div> -> `;
        let startF = campName === 1 ? 1 : campName + 1;
        
        for (let i = 0; i < 5; i++) {
            let f = startF + i;
            let isCurrentCombat = (this.state === 'combat' && this.floor === f);
            if (f % 10 === 0) {
                htmlStr += `<div class="map-node boss ${isCurrentCombat ? 'active' : ''}">[首领${f}]</div>`;
            } else if (f % 5 === 0) {
                htmlStr += `<div class="map-node camp ${isCurrentCombat ? 'active' : ''}">[节点${f}]</div>`;
            } else {
                htmlStr += `<div class="map-node ${isCurrentCombat ? 'active' : ''}">${f}</div>`;
            }
            if (i < 4) {
                htmlStr += ' -> ';
            }
        }
        document.getElementById('ui-map-radar').innerHTML = htmlStr;
    }

    // 真实的战斗心跳业务逻辑
    tick(deltaTime) {
        // 🔴 修复：无论你在营地还是在打架，技能冷却和公共GCD绝对不停歇，且UI必须同步刷新
        if (this.gcdRemaining > 0) {
            this.gcdRemaining -= deltaTime;
        }
        
        this.skills.forEach(s => s.update(deltaTime));
        EBus.emit('ui_skills_cd', this.skills);

        // 如果在营地里，则自然恢复，阻断战斗判断
        if (this.state === 'camp') {
            if (this.player.hp < this.player.getMaxHp() || this.player.mp < this.player.getMaxMp()) {
                this.player.hp = Math.min(this.player.getMaxHp(), this.player.hp + this.player.getMaxHp() * 0.05 * (deltaTime / 1000));
                this.player.mp = Math.min(this.player.getMaxMp(), this.player.mp + this.player.getMaxMp() * 0.05 * (deltaTime / 1000));
                EBus.emit('ui_bars_update');
            }
            // 🔒 自动出发：血量与法力补满后，若开关开启则自动离开营地继续探索
            if (this.autoDepart && this.player.hp >= this.player.getMaxHp() && this.player.mp >= this.player.getMaxMp()) {
                this.startExplore();
            }
            return;
        }

        // 死亡检测拦截
        if (this.player.hp <= 0) {
            return this.die();
        }

      // 处理 Buff 与 AI 袭击
      this.processEffects(deltaTime);
      this.processMobAI(deltaTime);

      if (this.mob) EBus.emit('ui_monster_update', this.mob);

        // 击杀检测
        if (this.mob && this.mob.hp <= 0) {
            this.handleLoot();
            return;
        }

        // 自然回蓝 (1%/s)
        this.player.mp = Math.min(this.player.getMaxMp(), this.player.mp + (this.player.getMaxMp() * 0.01 * (deltaTime / 1000)));
        EBus.emit('ui_bars_update');

        // 执行本心跳的主动技能意图
        this.attemptExecution();
    }

    // 怪物反击，包含 RPG 正统双减伤公式！
    processMobAI(deltaTime) {
        if (!this.mob || this.mob.hp <= 0) {
            return;
        }
        
        this.mob.attackTimer += deltaTime;
        
	// 怪物读条满了，发动攻击
	if (this.mob.attackTimer >= this.mob.attackSpeed) {
		// 免疫状态检测：免疫期间不受任何伤害
		if (this.player.buffs.some(b => b.type === 'channel_immune')) {
			this.mob.attackTimer = 0;
			return;
		}
		this.mob.attackTimer = 0;
            let absorb = 0;
            
            // 先尝试提取玩家当前的护盾总值
            this.player.buffs.forEach(b => { 
                if (b.type === 'shield') {
                    absorb += b.val; 
                }
            });
            
            // 核心防暴毙公式：只有纯粹的防御力才能提供高额物理减伤！最高 85%！
            let def = this.player.stats.int || 0;
            let armorDR = def / (def + Math.max(1, this.player.level) * 40);
            armorDR = Math.min(0.85, armorDR);
            
            // 共鸣（共鸣/全能）保留作为稀有词条微小的全属性减伤支持，总减伤绝不超过 95%
            let versaDR = (this.player.stats.versa || 0) * 0.0015;
            // 🔒 终焉被动减伤
            let passiveDR = (this.player.stats.dmg_down_pct || 0) / 100;
            let totalDR = Math.min(0.95, armorDR + versaDR + passiveDR); 

            // 计算真实伤害
            let rawDmg = this.mob.atk;
            let finalDmg = Math.max(1, Math.floor(rawDmg * (1 - totalDR)));

            // 🔴 修复：护盾真实扣除重构，余量正确传递，绝不穿透到血条
            for(let i = 0; i < this.player.buffs.length; i++) {
                let b = this.player.buffs[i];
                if (b.type === 'shield' && finalDmg > 0) {
                    if (b.val >= finalDmg) { 
                        b.val -= finalDmg; 
                        finalDmg = 0; 
                    } else { 
                        finalDmg -= b.val; 
                        b.val = 0; 
                    }
                }
            }
            
            // 清理碎掉的盾
            this.player.buffs = this.player.buffs.filter(b => b.type !== 'shield' || b.val > 0);

            if (finalDmg <= 0) {
                this.log(`🛡️ 护盾抵消了 ${this.mob.name} 的全部残余伤害!`, 'sys');
            } else {
                this.player.hp -= finalDmg;
                this.log(`💢 ${this.mob.name} 击中你！造成 <span style="color:#ef4444">${formatNumber(finalDmg)}</span> 伤 (减伤:${(totalDR*100).toFixed(1)}%)`, 'err');
            }
            EBus.emit('ui_bars_update');
        }
    }

    processEffects(deltaTime) {
        // 更新自身 Buff (包含持续回血 hot)
        for (let i = this.player.buffs.length - 1; i >= 0; i--) {
            let b = this.player.buffs[i];
            b.dur -= deltaTime;

            // 持续回血：每秒跳动
            if (b.type === 'hot') {
                b.tickTimer = (b.tickTimer || 0) + deltaTime;
                if (b.tickTimer >= 1000) {
                    b.tickTimer -= 1000;
                    let healAmt = Math.floor(this.player.getMaxHp() * (b.pct || 0));
                    this.player.hp = Math.min(this.player.getMaxHp(), this.player.hp + healAmt);
                    this.log(`💚 [持续恢复] 回复 ${formatNumber(healAmt)} 点生命`, 'heal');
                }
            }

            if (b.dur <= 0) { 
                this.player.buffs.splice(i, 1); 
                this.player.recalcStats(); 
            }
        }

        // 更新怪物的 Debuff 及 DoT（流血等）
        // 🔴 修复：易伤改为乘算叠加，不再出现加算导致的倍率崩坏
        let vulnMult = 1.0;
        for (let i = this.mob.buffs.length - 1; i >= 0; i--) {
            let eff = this.mob.buffs[i];
            eff.dur -= deltaTime;
            if (eff.type === 'vuln') {
                vulnMult *= eff.val; // 核心修复：多个易伤独立相乘
            }

		eff.tickTimer = (eff.tickTimer || 0) + deltaTime;
		// DoT 增益检测：虚空化身期间 tick 间隔减半、伤害翻倍
		let dotTickInterval = 1000;
		let dotEnhance = this.player.buffs.some(b => b.type === 'dot_enhance');
		if (dotEnhance) dotTickInterval = 500;
    if (eff.type === 'dot' && eff.tickTimer >= dotTickInterval) {
      eff.tickTimer -= dotTickInterval;
      let effectiveDps = dotEnhance ? eff.dps * 2 : eff.dps;
      let res = this.calcDmg(effectiveDps, vulnMult);
      this.mob.hp -= res.val;
      let dotLogMsg = `${eff.stateEmoji || '☠️'} [${eff.stateName || 'DoT'}] 造成 ${formatNumber(res.val)} 点伤害`;
      if (eff.stateName === '虹吸') {
        let healAmt = Math.floor(res.val * 0.3);
        this.player.hp = Math.min(this.player.getMaxHp(), this.player.hp + healAmt);
        dotLogMsg += `，汲取 ${formatNumber(healAmt)} 点生命`;
      }
      this.log(dotLogMsg, 'sys');
    }
            
    if (eff.dur <= 0) {
        this.mob.buffs.splice(i, 1);
      }
    }
    }

    calcDmg(mult, vuln) {
        let { atk, crit, versa } = this.player.stats;
        let dmg = atk * mult;
        
        // 🔴 修复：暴击率硬上限 100%，防止无意义溢出
        let effectiveCrit = Math.min(100, Math.max(0, crit));
        let isC = (Math.random() * 100) < effectiveCrit;
        if (isC) {
            dmg *= 1.5;
        }
        // 🔒 终焉被动增伤
        dmg *= (1 + versa / 100) * vuln * (1 + (this.player.stats.dmg_up_pct || 0) / 100);
        return { val: Math.max(1, Math.floor(dmg)), isCrit: isC };
    }

    // ====== 最强防假执行意图判定 (心血结晶，绝无乱插队) ======
	attemptExecution() {
		// 蓄力状态检测：蓄力期间不可施放任何技能
		if (this.player.buffs.some(b => b.type === 'channel_immune')) {
			return;
		}
		if (!this.sequence || this.sequence.ids.length === 0) {
            // 没有排任何轴的话，就一直平A兜底
            if (this.gcdRemaining <= 0) {
                this.executeSkill(this.skills[0]);
            }
            return;
        }

        // 🛡️ 优先级 0：oGCD 独立能力技，它不占用 GCD，它是神！随时可以无视顺序瞬间穿插！
        let oGcds = this.sequence.ids
            .map(id => this.skills.find(s => s.id === id))
            .filter(s => s && s.type === 'ogcd' && s.isReady(this.player.mp));
            
        if (oGcds.length > 0) {
            oGcds.sort((a, b) => b.priority - a.priority);
            return this.executeSkill(oGcds[0]);
        }

        // ====== 剩下的技能全部受大地的约束，如果公共 CD 在转，谁都必须等着！======
        if (this.gcdRemaining > 0) {
            return;
        }

        // 🛡️ 优先级 1：开局起手爆发期！不砸完大招，绝对不进入后面的 1234 循环！
        if (this.openerPhase) {
            if (this.sequence.openers.length === 0) {
                this.openerPhase = false; 
            } else {
                let readyOps = this.sequence.openers
                    .map(id => this.skills.find(s => s.id === id))
                    .filter(s => s && s.isReady(this.player.mp));

                if (readyOps.length > 0) {
                    readyOps.sort((a, b) => b.priority - a.priority);
                    return this.executeSkill(readyOps[0]); 
                }

                // 起手技能在等待 CD 或者蓝不够...
                let allFired = this.sequence.openers
                    .map(id => this.skills.find(s => s.id === id))
                    .filter(s => s)
                    .every(s => s.currentCd > 0);

                if (allFired) {
                    this.openerPhase = false; // 大招全部砸完，爆发结束，进入普通宏按键
                } else {
                    // 🔴 核心修复：杜绝起手卡死！即便蓝不够放起手技，也允许降级进入循环回蓝，而不是原地等死！
                    this.openerPhase = false; 
                }
            }
        }

        // 🛡️ 优先级 2：一刻不差的顺序遍历。严格按照你排的 1、2、3、4 从上到下横推！
        let loopLimit = 0;
        let maxLen = this.sequence.ids.length;
        
        while (loopLimit < maxLen) {
            let sk = this.skills.find(s => s.id === this.sequence.ids[this.seqIdx]);
            
            // 🔴 核心修复：debuff 类型同样受 GCD 约束，加入类型放行判定
            if (sk && sk.type !== 'ogcd' && sk.type !== 'passive' && sk.isReady(this.player.mp)) {
                this.executeSkill(sk);
                this.seqIdx = (this.seqIdx + 1) % maxLen; // 指针移动到下一个，完工
                return;
            }
            
            // 轮到这个技能了，但是它CD在转，或者没有蓝？直接无视它，指针挪到下一个看能不能用！
            this.seqIdx = (this.seqIdx + 1) % maxLen;
            loopLimit++;
        }
    }

	executeSkill(s) {
		// 条件技能前置检查：不满足条件则不执行、不消耗、不触发CD
		if (s.conditionMaxHPPct !== undefined) {
			let hpPct = (this.player.hp / this.player.getMaxHp()) * 100;
			if (hpPct > s.conditionMaxHPPct) {
				return;
			}
		}
		this.player.mp -= s.cost;
        
        // 🌟 修复：传入终焉冷却缩减值，支持终焉宝珠生效
        s.startCD(this.player.stats.finale_cd || 0);
        
        if (s.type !== 'ogcd' && s.type !== 'passive') {
            // 受急速动态压缩的公共冷却时间
            this.gcdRemaining = this.baseGCD / (1 + this.player.stats.haste / 100);
        }

        // 让 UI 高亮框响应
        EBus.emit('ui_cast_highlight', s.id);
        let logStr = `★ 咏唱【${s.name}】→ `;

        if (s.dmgMult > 0) {
            let v = 1.0;
            this.mob.buffs.forEach(b => { 
                if (b.type === 'vuln') {
                    v *= b.val; 
                }
            });
            let res = this.calcDmg(s.dmgMult, v);
            this.mob.hp -= res.val;
            logStr += `造成 <span class="log-dmg">${formatNumber(res.val)}</span> 伤害 ${res.isCrit ? '(暴击!)' : ''}`;
        }

        // 🔒 技能效果处理器重构：应用映射表模式
        if (s.effects) {
            s.effects.forEach(eff => {
                let e = JSON.parse(JSON.stringify(eff));
                let handler = effectHandlers[e.type];
                if (handler) {
                    logStr += handler(e, this);
                }
            });
        }

        if (s.dmgMult === 0 && !s.effects) {
            logStr += "（无效果）";
        }
        
        this.log(logStr, s.dmgMult > 0 ? 'dmg' : 'sys');
        EBus.emit('ui_bars_update');
    }

    handleLoot() {
        this.log(`✔️ 突破了第 ${this.floor} 层！`, 'sys');

        // 真实战利品掉落计算
        let expGain = Math.floor(this.mob.level * 15 * (1 + Math.pow(this.floor, 0.4)));
        this.player.gold += Math.max(1, Math.floor(Math.random() * this.floor * 5));
        this.player.addExp(expGain);

        let dropChance = this.mob.isBoss ? 1.0 : 0.2 + (this.floor * 0.01);
        if (Math.random() < dropChance || this.godMode) {
            let gear = GearGenerator.generate(
                this.floor,
                this.mob.isBoss ? Math.max(4, Math.floor(Math.random() * 9)) : -1
            );
            // 🔒 移除背包容量限制：掉落装备直接调用无容量判断的 lootItem
            this.player.lootItem(gear);
        }

        // 🔮 宝珠掉落判断：小怪15%概率，Boss必掉且多掉
        let orbDropChance = this.mob.isBoss ? 1.0 : 0.15;
        if (Math.random() < orbDropChance || this.godMode) {
            let dropCount = this.mob.isBoss ? 3 : 1;
            for(let i = 0; i < dropCount; i++) {
                let dropOrb = ORBS[Math.floor(Math.random() * ORBS.length)];
                this.player.orbs[dropOrb.id] = (this.player.orbs[dropOrb.id] || 0) + 1;
                this.log(`🔮 发现了稀有材料：[ ${dropOrb.name} ]！`, 'loot');
            }
        }

        // 防暴毙机制拦截判定
        let safePct = parseInt(document.getElementById('ui-retreat-pct').value) || 0;
        let currPct = (this.player.hp / this.player.getMaxHp()) * 100;
        let shouldRetreat = (currPct < safePct);

        if (this.floor > this.player.maxFloor) {
            this.player.maxFloor = this.floor;
        }

        let justBeatFloor = this.floor;
        this.floor++;
        Storage.set('engine_floor', this.floor);
        this.player.save();

        if (shouldRetreat) {
            this.state = 'combat';
            this.triggerRetreat(false); // 触发自动滚回营地
            return;
        }

        // 逢 5 层打赢，抵达休息区
        if (justBeatFloor % 5 === 0) {
            this.state = 'camp';
            document.getElementById('mob-area').style.display = 'none';
            this.log(`⛺ 抵达绝对安全区：第 ${justBeatFloor} 层营地。已就地驻扎休整。`, 'sys');
            this.updateMapUI();
        } else {
            this.spawnMob(); // 没到休息区，直接遇到下一只怪开打
        }
    }
}
