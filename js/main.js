import { EBus, Player, CombatEngine, Storage, GearGenerator } from './engine.js';
import { UIController } from './ui.js';
import { SLOTS } from './data.js';
// 🔒 Lit 组件：按需导入以自动注册自定义元素
import './components/combat-log.js';
import './components/mob-buffs.js';
import './components/ui-equips.js';
import './components/sequence-list.js';
import './components/stats-grid.js';

class GMTools {
    static levelUp() { 
        window.player.level += 100; 
        window.player.recalcStats(); 
        window.player.save(); 
        window.ui.refreshAll(); 
        EBus.emit('log','GM: 强行跨越位阶 +100 级', 'err'); 
    }
    static addGold() { 
        window.player.gold += 10000000; 
        window.player.save(); 
        window.ui.refreshAll(); 
        EBus.emit('log','GM: 国库金币暴涨！', 'err'); 
    }
    static godMode() {
        let isGod = !window.engine.godMode; 
        EBus.emit('god_mode', isGod); 
        document.getElementById('gm-god').innerText = isGod ? '开' : '关'; 
        document.getElementById('gm-god').style.color = isGod ? '#ef4444' : ''; 
    }
    static unlockSkills() { 
        Storage.set('gm_unlock_all', true); 
        window.ui.refreshAll(); 
        EBus.emit('log', 'GM: 已解除所有技能的等级限制', 'sys');
    }
    static genUltimate() {
        SLOTS.forEach(slotName => { 
            // 🌟 核心修复：传入 slotName，保证装备生成时严格遵循该槽位的属性规则
            // 避免旧版中先生成随机槽位装备再强行覆盖 slot 字段，导致"武器加防御、防具加攻击"的属性错乱
            let godGear = GearGenerator.generate(window.player.level, 8, slotName); 
            window.player.equips[slotName] = godGear; 
        });
        window.player.recalcStats(); 
        window.player.save(); 
        window.ui.refreshAll(); 
        EBus.emit('log','[神降] 全套终焉级武装已强制装填完毕！','err');
    }
    static clearSave() { 
        if(confirm("毁灭该纪元，重置所有印记？(清除所有存档数据)")) { 
            Storage.clear(); 
            location.reload(); 
        } 
    }
}

// 初始化启动
window.onload = () => {
    // 实例化核心对象
    const player = new Player();
    const engine = new CombatEngine(player);
    const ui = new UIController(player);

    // 将需要被 HTML onclick 直接调用的实例强行暴露给全局 Window
    window.player = player;
    window.engine = engine;
    window.ui = ui;
    window.GM = GMTools;

    window.ui.refreshAll();

    // 🔒 存档系统重构：移除Base64弹窗，改为文件下载/上传机制（需求第11项）
    // 绑定导出存档功能：将 localStorage 中前缀为 mgrpg_ 的数据打包为JSON文件触发下载
    document.getElementById('btn-export-save').addEventListener('click', () => {
        let exportData = {};
        for(let i = 0; i < localStorage.length; i++) {
            let k = localStorage.key(i);
            if(k.startsWith('mgrpg_')) exportData[k] = localStorage.getItem(k);
        }
        // 🔒 替换原 Base64 逻辑：使用 Blob 生成下载链接，自动触发文件下载
        let jsonStr = JSON.stringify(exportData, null, 2);
        let blob = new Blob([jsonStr], { type: 'application/json' });
        let url = URL.createObjectURL(blob);
        let a = document.createElement('a');
        a.href = url;
        a.download = '末光咏叹_存档.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        EBus.emit('log', '💾 存档文件已下载保存。', 'sys');
    });

    // 🔒 绑定导入存档功能：点击按钮触发隐藏的文件选择输入框
    document.getElementById('btn-import-save').addEventListener('click', () => {
        document.getElementById('file-import-save').click();
    });

    // 🔒 手机端 Tab 切换：点击底部导航按钮切换显示对应面板
    const mobileTabs = document.querySelectorAll('.mobile-tab');
    const panels = { 'col-left': document.querySelector('.col-left'), 'col-mid': document.querySelector('.col-mid'), 'col-right': document.querySelector('.col-right') };
    mobileTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            mobileTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            Object.values(panels).forEach(p => p.classList.remove('active'));
            panels[tab.dataset.panel].classList.add('active');
        });
    });
    if (window.innerWidth <= 768) panels['col-left'].classList.add('active');

    document.getElementById('file-import-save').addEventListener('change', (e) => {
        let file = e.target.files[0];
        if (!file) return;
        let reader = new FileReader();
        reader.onload = function(event) {
            try {
                let data = JSON.parse(event.target.result);
                // 校验数据格式合法性：检查是否为对象
                if (typeof data !== 'object' || data === null) {
                    throw new Error('无效的存档格式');
                }
                for(let k in data) {
                    localStorage.setItem(k, data[k]);
                }
                alert("存档覆盖导入成功！游戏环境即将重启。");
                location.reload();
            } catch(err) {
                alert("你上传的存档文件已经腐化损坏或格式不正确！");
            }
        };
        reader.readAsText(file);
        // 🔒 重置输入框的值，允许重复选择同一文件
        e.target.value = '';
    });
};

// 🔒 GM面板密码保护功能：在控制台输入 window.enableGM('密码') 解锁显示面板
window.enableGM = function(password) {
    // 硬编码密码验证
    if (password === 'architect') {
        // 验证通过，为GM面板添加可见类名
        document.getElementById('gm-panel').classList.add('visible');
        // 控制台输出成功提示
        console.log('%c[系统] ARCHITECT 终端已解锁。', 'color: #ff4785; font-weight: bold;');
    } else {
        console.warn('[警告] GM面板解锁密码错误！');
    }
};
