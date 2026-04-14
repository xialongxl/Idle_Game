export const SKILLS_DB = [
    { id: 's01', name: '魔力弹', reqLv: 1, type: 'gcd', cd: 0, cost: 0, dmgMult: 1.0, priority: 1, desc:'[GCD] 造成100%伤害，无消耗无冷却。' },
    
    { id: 's02', name: '光辉护甲', reqLv: 3, type: 'buff', cd: 30000, cost: 15, dmgMult: 0, effects:[{type:'buff', stat:'versa', val:10, dur:15000}], priority: 9, desc:'[Buff] 提升共鸣10%，持续15秒，消耗15法力，冷却30秒。' },
    { id: 's03', name: '星尘咏叹', reqLv: 3, type: 'gcd', cd: 2500, cost: 5, dmgMult: 1.8, priority: 5, desc:'[GCD] 造成180%伤害，消耗5法力，冷却2.5秒。' },
    
    { id: 's04', name: '痛苦诅咒', reqLv: 5, type: 'dot', cd: 10000, cost: 10, dmgMult: 0.5, effects:[{type:'dot', dur:12000, dps:0.8}], priority: 8, desc:'[DoT] 立即造成50%伤害，后续每秒造成80%伤害，持续12秒，消耗10法力，冷却10秒。' },
    { id: 's05', name: '生命绽放', reqLv: 5, type: 'gcd', cd: 15000, cost: 20, dmgMult: 0, effects:[{type:'heal', val:5.0}], priority: 12, desc:'[治疗] 恢复500%攻击力的生命值，消耗20法力，冷却15秒。' },
    
    { id: 's06', name: '冰霜新星', reqLv: 10, type: 'gcd', cd: 8000, cost: 12, dmgMult: 2.2, priority: 6, desc:'[GCD] 造成220%伤害，消耗12法力，冷却8秒。' },
    { id: 's07', name: '黑暗契约', reqLv: 12, type: 'ogcd', cd: 20000, cost: 0, dmgMult: 0, effects:[{type:'mp_recover_pct', val:0.08}], priority: 11, desc:'[oGCD] 瞬间恢复8%最大法力值，无消耗，冷却20秒。' },
    { id: 's08', name: '虚空箭', reqLv: 18, type: 'gcd', cd: 4000, cost: 8, dmgMult: 1.5, priority: 4, desc:'[GCD] 造成150%伤害，消耗8法力，冷却4秒。' },
    { id: 's09', name: '灵魂燃烧', reqLv: 20, type: 'gcd', cd: 12000, cost: 20, dmgMult: 4.0, priority: 7, desc:'[GCD] 造成400%伤害，消耗20法力，冷却12秒。' },
    { id: 's10', name: '月火术', reqLv: 22, type: 'dot', cd: 5000, cost: 8, dmgMult: 1.0, effects:[{type:'dot', dur:10000, dps:1.0}], priority: 8, desc:'[DoT] 立即造成100%伤害，后续每秒造成100%伤害，持续10秒，消耗8法力，冷却5秒。' },
    
    { id: 's11', name: '闪电链', reqLv: 25, type: 'gcd', cd: 6000, cost: 15, dmgMult: 2.5, priority: 5, desc:'[GCD] 造成250%伤害，消耗15法力，冷却6秒。' },
    { id: 's12', name: '生命泉涌', reqLv: 25, type: 'buff', cd: 30000, cost: 20, dmgMult: 0, effects:[{type:'hot', pct:0.05, dur:10000}], priority: 12, desc:'[治疗][Buff] 每秒恢复5%最大生命值，持续10秒，消耗20法力，冷却30秒。' },
    
    { id: 's13', name: '魔力护盾', reqLv: 28, type: 'ogcd', cd: 40000, cost: 30, dmgMult: 0, effects:[{type:'shield', hpPct:0.2, dur:10000}], priority: 11, desc:'[oGCD] 生成可吸收20%最大生命值伤害的护盾，持续10秒，消耗30法力，冷却40秒。' },
    { id: 's14', name: '炎爆术', reqLv: 30, type: 'gcd', cd: 15000, cost: 25, dmgMult: 5.5, priority: 7, desc:'[GCD] 造成550%伤害，消耗25法力，冷却15秒。' },
    { id: 's15', name: '迅捷微风', reqLv: 32, type: 'buff', cd: 45000, cost: 10, dmgMult: 0, effects:[{type:'buff', stat:'haste', val:15, dur:20000}], priority: 10, desc:'[Buff] 提升冷却缩减15%，持续20秒，消耗10法力，冷却45秒。' },
    { id: 's16', name: '暗言术·灭', reqLv: 35, type: 'ogcd', cd: 12000, cost: 0, dmgMult: 3.0, priority: 11, desc:'[oGCD] 造成300%伤害，无消耗，冷却12秒。' },
    { id: 's17', name: '神圣惩击', reqLv: 38, type: 'gcd', cd: 0, cost: 8, dmgMult: 1.2, priority: 2, desc:'[GCD] 造成120%伤害，消耗8法力，无冷却。' },
    
    { id: 's18', name: '死亡标记', reqLv: 40, type: 'debuff', cd: 30000, cost: 15, dmgMult: 0, effects:[{type:'vuln', val:1.2, dur:10000}], priority: 15, desc:'[Debuff] 使目标受到的伤害提高20%，持续10秒，消耗15法力，冷却30秒。' },
    { id: 's19', name: '再生祷言', reqLv: 40, type: 'buff', cd: 45000, cost: 15, dmgMult: 0, effects:[{type:'hot', pct:0.03, dur:15000}], priority: 12, desc:'[治疗][Buff] 每秒恢复3%最大生命值，持续15秒，消耗15法力，冷却45秒。' },
    
    { id: 's20', name: '血晶爆发', reqLv: 42, type: 'gcd', cd: 8000, cost: 15, dmgMult: 2.8, priority: 5, desc:'[GCD] 造成280%伤害，消耗15法力，冷却8秒。' },
    { id: 's21', name: '星落', reqLv: 45, type: 'dot', cd: 20000, cost: 35, dmgMult: 2.0, effects:[{type:'dot', dur:8000, dps:2.5}], priority: 9, desc:'[DoT] 立即造成200%伤害，后续每秒造成250%伤害，持续8秒，消耗35法力，冷却20秒。' },
    { id: 's22', name: '奥术飞弹', reqLv: 50, type: 'gcd', cd: 5000, cost: 12, dmgMult: 2.5, priority: 6, desc:'[GCD] 造成250%伤害，消耗12法力，冷却5秒。' },
    
    { id: 's23', name: '能量灌注', reqLv: 51, type: 'buff', cd: 60000, cost: 0, dmgMult: 0, effects:[{type:'buff', stat:'haste', val:30, dur:15000}], priority: 15, desc:'[Buff] 冷却缩减提升30%，持续15秒，无消耗，冷却60秒。' },
    { id: 's24', name: '神圣领域', reqLv: 55, type: 'gcd', cd: 40000, cost: 50, dmgMult: 0, effects:[{type:'heal', val:20}], priority: 12, desc:'[治疗] 恢复2000%攻击力的生命值，消耗50法力，冷却40秒。' },
    { id: 's25', name: '混沌箭', reqLv: 58, type: 'gcd', cd: 18000, cost: 30, dmgMult: 6.5, priority: 7, desc:'[GCD] 造成650%伤害，消耗30法力，冷却18秒。' },
    { id: 's26', name: '暗影裂隙', reqLv: 60, type: 'ogcd', cd: 25000, cost: 20, dmgMult: 4.5, priority: 11, desc:'[oGCD] 造成450%伤害，消耗20法力，冷却25秒。' },
    { id: 's27', name: '寒冰长矛', reqLv: 62, type: 'gcd', cd: 3000, cost: 10, dmgMult: 1.8, priority: 4, desc:'[GCD] 造成180%伤害，消耗10法力，冷却3秒。' },
    { id: 's28', name: '时间扭曲', reqLv: 65, type: 'buff', cd: 120000, cost: 100, dmgMult: 0, effects:[{type:'buff', stat:'haste', val:50, dur:20000}], priority: 16, desc:'[Buff] 冷却缩减提升50%，持续20秒，消耗100法力，冷却120秒。' },
    { id: 's29', name: '腐蚀之种', reqLv: 68, type: 'dot', cd: 15000, cost: 20, dmgMult: 1.5, effects:[{type:'dot', dur:15000, dps:1.5}], priority: 8, desc:'[DoT] 立即造成150%伤害，后续每秒造成150%伤害，持续15秒，消耗20法力，冷却15秒。' },
    { id: 's30', name: '真言术·慰', reqLv: 70, type: 'ogcd', cd: 15000, cost: 0, dmgMult: 2.0, effects:[{type:'mp_recover_pct', val:0.05}], priority: 11, desc:'[oGCD] 造成200%伤害，并恢复5%最大法力值，无消耗，冷却15秒。' },
    { id: 's31', name: '狂暴之心', reqLv: 72, type: 'buff', cd: 45000, cost: 0, dmgMult: 0, effects:[{type:'buff', stat:'crit', val:20, dur:10000}], priority: 10, desc:'[Buff] 提升暴击率20%，持续10秒，无消耗，冷却45秒。' },
    { id: 's32', name: '龙破斩', reqLv: 75, type: 'gcd', cd: 24000, cost: 40, dmgMult: 8.0, priority: 7, desc:'[GCD] 造成800%伤害，消耗40法力，冷却24秒。' },
    { id: 's33', name: '星光虹吸', reqLv: 76, type: 'dot', cd: 12000, cost: 15, dmgMult: 0.5, effects:[{type:'dot', dur:10000, dps:1.0}], priority: 9, desc:'[DoT] 立即造成50%伤害，后续每秒造成100%伤害，持续10秒，消耗15法力，冷却12秒。' },
    { id: 's34', name: '法力共鸣', reqLv: 77, type: 'ogcd', cd: 60000, cost: 0, dmgMult: 0, effects:[{type:'mp_recover_pct', val:0.20}], priority: 12, desc:'[oGCD] 瞬间恢复20%最大法力值，无消耗，冷却60秒。' },
    { id: 's35', name: '幻影连击', reqLv: 78, type: 'gcd', cd: 10000, cost: 25, dmgMult: 4.5, priority: 6, desc:'[GCD] 造成450%伤害，消耗25法力，冷却10秒。' },
    { id: 's36', name: '灾厄降临', reqLv: 79, type: 'dot', cd: 30000, cost: 50, dmgMult: 3.0, effects:[{type:'dot', dur:12000, dps:3.0}], priority: 10, desc:'[DoT] 立即造成300%伤害，后续每秒造成300%伤害，持续12秒，消耗50法力，冷却30秒。' },
    { id: 's37', name: '破晓之光', reqLv: 80, type: 'gcd', cd: 20000, cost: 35, dmgMult: 5.0, priority: 6, desc:'[GCD] 造成500%伤害，消耗35法力，冷却20秒。' },
    
    { id: 's38', name: '终焉咏叹调', reqLv: 85, type: 'gcd', cd: 60000, cost: 80, dmgMult: 12.0, priority: 14, desc:'[终焉][GCD] 造成1200%伤害，消耗80法力，冷却60秒。' },
    { id: 's39', name: '星蚀·黑洞', reqLv: 90, type: 'dot', cd: 90000, cost: 100, dmgMult: 5.0, effects:[{type:'dot', dur:15000, dps:5.0}], priority: 15, desc:'[终焉][DoT] 立即造成500%伤害，后续每秒造成500%伤害，持续15秒，消耗100法力，冷却90秒。' },
    { id: 's40', name: '法则解构', reqLv: 95, type: 'debuff', cd: 120000, cost: 50, dmgMult: 0, effects:[{type:'vuln', val:1.5, dur:15000}], priority: 17, desc:'[终焉][Debuff] 使目标受到的伤害提高50%，持续15秒，消耗50法力，冷却120秒。' },
    { id: 's41', name: '无限魔阵', reqLv: 99, type: 'buff', cd: 150000, cost: 0, dmgMult: 0, effects:[{type:'buff', stat:'versa', val:50, dur:20000}, {type:'mp_recover_pct', val:1.0}], priority: 18, desc:'[终焉][Buff] 提升共鸣50%，持续20秒，并完全恢复法力值，无消耗，冷却150秒。' },
    { id: 's42', name: '阿赖耶识·斩', reqLv: 100, type: 'ogcd', cd: 180000, cost: 150, dmgMult: 25.0, priority: 20, desc:'[终焉][oGCD] 造成2500%伤害，消耗150法力，冷却180秒。' },

    // 🔒 终焉被动技能：穿戴终焉装备时自动解锁生效，不在技能池显示
    { id: 's_passive_01', name: '终焉之力', reqLv: 1, type: 'passive', cd: 0, cost: 0, dmgMult: 0, priority: 0, desc:'[被动] 造成伤害提高10%，受到伤害降低10%。' }
];

export const GEAR_RARITY = [
    { name: '破损', color: 'q0', mult: 0.5 }, { name: '普通', color: 'q1', mult: 1.0 },
    { name: '精良', color: 'q2', mult: 1.5 }, { name: '卓越', color: 'q3', mult: 2.2 },
    { name: '史诗', color: 'q4', mult: 3.5 }, { name: '传说', color: 'q5', mult: 6.0 },
    { name: '神话', color: 'q6', mult: 10.0 }, 
    { name: '圣物', color: 'q7', mult: 15.0 }, 
    { name: '终焉', color: 'q8', mult: 22.0 } 
];

export const SLOTS = ['weapon', 'head', 'chest', 'legs', 'ring', 'trinket'];
export const SLOT_NAMES = {weapon:'武器', head:'头盔', chest:'胸甲', legs:'护腿', ring:'戒坠', trinket:'遗物'};

export const SLOT_BASE_NAMES = {
    weapon: ['法杖', '魔杖', '咒刃', '魂弓', '法典', '灵刃', '权杖', '秘典'],
    head: ['法冠', '巫帽', '兜帽', '光环', '灵冠', '面具', '额饰'],
    chest: ['法袍', '轻甲', '长袍', '皮衣', '圣衫', '布衣', '符文衣'],
    legs: ['护腿', '法裤', '轻靴', '长裤', '布靴', '灵鞋'],
    ring: ['魔戒', '指环', '印戒', '暗环', '秘戒'],
    trinket: ['挂坠', '护符', '圣徽', '魂匣', '宝珠', '颈饰']
};

export const ORBS = [
    { id: 'orb_hp', name: '生命宝珠', stat: 'hp_pct', val: 45, desc: '最大生命值+45%' },
    { id: 'orb_atk', name: '攻击宝珠', stat: 'atk_pct', val: 45, desc: '攻击力+45%' },
    { id: 'orb_versa', name: '共鸣宝珠', stat: 'versa', val: 30, desc: '共鸣+30%' },
    { id: 'orb_crit', name: '暴击宝珠', stat: 'crit', val: 20, desc: '暴击率+20%' },
    { id: 'orb_finale', name: '终焉回响', stat: 'finale_cd', val: 20, desc: '缩短终焉技能冷却时间20%' }
];

export const MAX_SAME_ORB = 3;