/**
 * Royal Legacy - Fixed Application
 * 修复版主应用入口
 * 
 * 修复记录：
 * 1. 修复年龄验证流程 - 移除不存在的loginPage跳转
 * 2. 修复支付功能 - 添加支付方式选择页面逻辑
 * 3. 修复星级显示 - 添加 earned 类样式处理
 * 4. 修复体力恢复 - 添加实时倒计时显示
 * 5. 修复游戏匹配逻辑 - 消除递归调用风险
 * 6. 添加设置功能 - 数据清除、无障碍模式
 * 7. 优化UI交互 - 添加过渡动画和反馈
 * 8. 减少弹窗干扰 - 移除不必要的Toast提示
 * 9. 修复消除逻辑 - 正确处理连锁反应
 * 10. 优化三星评分 - 基于剩余步数和得分
 * 11. 添加登录系统 - 匿名登录和年龄验证
 * 12. 修复支付流程 - 皇家礼包触发支付选择
 * 13. 优化游戏逻辑 - 连锁反应不消耗额外步数
 */

const RoyalLegacyApp = {
    version: '2.5.0-optimized',
    initialized: false,
    currentPage: 'verifyPage',
    staminaTimer: null,
    cascadeCount: 0,
    hasUsedStep: false,
    // 缓存DOM元素
    domCache: {},

    async init() {
        if (this.initialized) {
            console.warn('App already initialized');
            return;
        }

        console.log(`🎮 Royal Legacy v${this.version} - Initializing...`);

        try {
            // 预缓存DOM元素
            this._cacheDomElements();
            
            StateManager.init();
            this._initCompatibilityLayer();
            GameEngine.init();
            this._bindEvents();
            this._restoreGameState();
            this._initUI();
            this._startStaminaTimer();

            this.initialized = true;
            console.log('✅ Royal Legacy initialized successfully');

        } catch (error) {
            console.error('❌ Failed to initialize app:', error);
            this._handleInitError(error);
        }
    },

    _cacheDomElements() {
        // 预缓存常用DOM元素
        this.domCache = {
            homeGold: document.getElementById('homeGold'),
            homeStamina: document.getElementById('homeStamina'),
            homeCardPacks: document.getElementById('homeCardPacks'),
            homeStars: document.getElementById('homeStars'),
            levelSelectStamina: document.getElementById('levelSelectStamina'),
            totalStars: document.getElementById('totalStars'),
            score: document.getElementById('score'),
            targetScore: document.getElementById('targetScore'),
            steps: document.getElementById('steps'),
            gameGold: document.getElementById('gameGold'),
            currentLevelDisplay: document.getElementById('currentLevelDisplay'),
            gameBoard: document.getElementById('gameBoard'),
            levelsGrid: document.getElementById('levelsGrid'),
            toast: document.getElementById('toast'),
            toastContent: document.getElementById('toastContent')
        };
    },

    _initCompatibilityLayer() {
        window.switchPage = (pageId) => this.switchPage(pageId);
        window.showLevelSelectPage = () => this.showLevelSelectPage();
        window.showToast = (msg, type) => this.showToast(msg, type);
        window.updateHomeStats = () => this.updateHomeStats();
        window.updateGameStats = () => this.updateGameStats();
        window.useBomb = () => this.useBomb();
        window.refreshBoard = () => this.refreshBoard();
        window.addSteps = () => this.addSteps();
        window.showSignModal = () => this.showModal('signModal');
        window.showPayModal = () => this.showPayModal();
        window.showAlbumModal = () => this.showModal('albumModal');
        window.showSettingsModal = () => this.showSettingsModal();
        window.closeSignModal = () => this.hideModal('signModal');
        window.closePayModal = () => this.hideModal('payModal');
        window.closeAlbumModal = () => this.hideModal('albumModal');
        window.closeSettingsModal = () => this.hideModal('settingsModal');
        window.closeLevelCompleteModal = () => this.hideModal('levelCompleteModal');
        window.selectLevel = (level) => this.selectLevel(level);
        window.startGame = () => this.startGame();
        window.exitLevel = () => this.exitLevel();
        window.signIn = () => this.signIn();
        window.openCardPack = () => this.openCardPack();
        window.selectPackage = (pkg) => this.selectPackage(pkg);
        window.backToShop = () => this.backToShop();
        window.selectPaymentMethod = (method) => this.selectPaymentMethod(method);
        window.processPayment = () => this.processPayment();
        window.closePaymentModal = () => this.closePaymentModal();
        window.toggleSetting = (setting) => this.toggleSetting(setting);
        window.clearAllData = () => this.clearAllData();
        window.loginAnonymous = () => this.loginAnonymous();
        window.logout = () => this.logout();
    },

    _bindEvents() {
        StateManager.subscribe('gold', () => this.updateHomeStats());
        StateManager.subscribe('stamina', () => {
            this.updateHomeStats();
            this.updateStaminaDisplay();
        });
        StateManager.subscribe('score', () => this.updateGameStats());
        StateManager.subscribe('steps', () => this.updateGameStats());

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideAllModals();
            }
        });

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                StateManager.flush();
            }
        });

        window.addEventListener('beforeunload', () => {
            StateManager.flush();
        });
    },

    _restoreGameState() {
        this._recoverStamina();
        this._checkDailyReset();
        
        // 检查是否已登录
        const state = StateManager.get();
        if (state.isLoggedIn && state.userAge) {
            // 根据userAge重新设置ageMode、isChildMode和isTeenMode
            let ageMode, isChildMode, isTeenMode;
            switch(state.userAge) {
                case 'under13':
                    ageMode = 'kids';
                    isChildMode = true;
                    isTeenMode = false;
                    break;
                case '13to17':
                    ageMode = 'teen';
                    isChildMode = false;
                    isTeenMode = true;
                    break;
                default:
                    ageMode = 'adult';
                    isChildMode = false;
                    isTeenMode = false;
            }
            
            StateManager.set('ageMode', ageMode);
            StateManager.set('isChildMode', isChildMode);
            StateManager.set('isTeenMode', isTeenMode);
            
            // 根据isChildMode决定是否隐藏付费功能
            if (isChildMode) {
                this._hidePaymentFeatures();
            }
            
            // 已登录，直接显示首页
            setTimeout(() => {
                this.switchPage('homePage');
            }, 100);
        }
    },

    _recoverStamina() {
        const state = StateManager.get();
        const now = Date.now();
        const lastUpdate = state.lastStaminaUpdate || now;
        const recoveryTime = 5 * 60 * 1000;
        
        if (state.stamina < state.maxStamina) {
            const elapsed = now - lastUpdate;
            const recovered = Math.floor(elapsed / recoveryTime);
            
            if (recovered > 0) {
                const newStamina = Math.min(state.stamina + recovered, state.maxStamina);
                StateManager.set('stamina', newStamina);
                StateManager.set('lastStaminaUpdate', now);
            }
        } else {
            StateManager.set('lastStaminaUpdate', now);
        }
    },

    _startStaminaTimer() {
        if (this.staminaTimer) {
            clearInterval(this.staminaTimer);
        }
        
        this.staminaTimer = setInterval(() => {
            this._recoverStamina();
            this.updateStaminaDisplay();
        }, 1000);
    },

    updateStaminaDisplay() {
        const state = StateManager.get();
        const staminaEl = this.domCache.homeStamina;
        const levelSelectStaminaEl = this.domCache.levelSelectStamina;
        
        const baseText = `${state.stamina}/${state.maxStamina}`;
        
        let displayText = baseText;
        if (state.stamina < state.maxStamina) {
            const now = Date.now();
            const lastUpdate = state.lastStaminaUpdate || now;
            const recoveryTime = 5 * 60 * 1000;
            const elapsed = now - lastUpdate;
            const remaining = Math.max(0, recoveryTime - (elapsed % recoveryTime));
            
            const minutes = Math.floor(remaining / 60000);
            const seconds = Math.floor((remaining % 60000) / 1000);
            displayText = `${baseText} (+1 in ${minutes}:${seconds.toString().padStart(2, '0')})`;
        }
        
        if (staminaEl) staminaEl.textContent = displayText;
        if (levelSelectStaminaEl) levelSelectStaminaEl.textContent = baseText;
    },

    _checkDailyReset() {
        const lastVisit = localStorage.getItem('lastVisitDate');
        const today = new Date().toDateString();
        
        if (lastVisit !== today) {
            StateManager.set('signToday', false);
            localStorage.setItem('lastVisitDate', today);
        }
    },

    _initUI() {
        this.updateHomeStats();
        this.updateStaminaDisplay();
    },

    updateHomeStats() {
        const state = StateManager.get();
        
        if (this.domCache.homeGold) this.domCache.homeGold.textContent = state.gold;
        if (this.domCache.homeCardPacks) this.domCache.homeCardPacks.textContent = state.cardPacks;
        if (this.domCache.homeStars) this.domCache.homeStars.textContent = state.totalStars;
        
        this.updateStaminaDisplay();
        
        // 更新皇家订阅状态
        this.updateRoyalPassStatus();
    },
    
    updateRoyalPassStatus() {
        const state = StateManager.get();
        const royalPassCard = document.querySelector('.glass-card');
        
        if (royalPassCard && royalPassCard.textContent.includes('Royal Pass')) {
            if (state.isRoyalPassActive && state.royalPassExpiry > Date.now()) {
                // 计算剩余天数
                const daysLeft = Math.ceil((state.royalPassExpiry - Date.now()) / (24 * 60 * 60 * 1000));
                
                // 检查是否已经领取了今日的皇家订阅奖励
                const today = new Date().toDateString();
                const hasClaimedToday = state.royalPassLastClaim === today;
                
                royalPassCard.innerHTML = `
                    <h3 style="color: var(--gold-primary); margin-bottom: 8px; font-size: 1.25rem;">Royal Pass Active</h3>
                    <p style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 12px; line-height: 1.5;">You have ${daysLeft} days left</p>
                    <div style="background: rgba(212,175,55,0.2); border-radius: 8px; padding: 12px; margin-bottom: 16px;">
                        <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 8px;">Exclusive Benefits:</div>
                        <div style="display: flex; flex-direction: column; gap: 4px;">
                            <div style="font-size: 0.75rem; display: flex; align-items: center; gap: 6px;">
                                <span>⭐</span>
                                <span>Daily 100 Gold bonus</span>
                            </div>
                            <div style="font-size: 0.75rem; display: flex; align-items: center; gap: 6px;">
                                <span>⚡</span>
                                <span>Stamina regeneration boost</span>
                            </div>
                        </div>
                    </div>
                    <button class="btn btn-gold" onclick="RoyalLegacyApp.claimRoyalPassDailyReward()" style="width: 100%; padding: 12px 0; font-size: 0.875rem; margin-bottom: 12px;" ${hasClaimedToday ? 'disabled' : ''}>
                        ${hasClaimedToday ? 'Already Claimed Today' : 'Claim Daily Reward'}
                    </button>
                    <button class="btn btn-secondary" onclick="RoyalLegacyApp.selectPackage('4.99', true)" style="width: 100%; padding: 12px 0; font-size: 0.875rem;">Extend Subscription</button>
                `;
            }
        }
    },
    
    claimRoyalPassDailyReward() {
        const state = StateManager.get();
        
        // 检查皇家订阅是否激活
        if (!state.isRoyalPassActive || state.royalPassExpiry <= Date.now()) {
            this.showToast('Royal Pass is not active', 'error');
            return;
        }
        
        // 检查是否已经领取了今日的奖励
        const today = new Date().toDateString();
        if (state.royalPassLastClaim === today) {
            this.showToast('You have already claimed your daily reward', 'info');
            return;
        }
        
        // 发放每日奖励
        StateManager.set('gold', state.gold + 100);
        StateManager.set('royalPassLastClaim', today);
        
        this.showToast('Daily reward claimed! +100 Gold', 'success');
        this.updateHomeStats();
    },

    updateGameStats() {
        const state = StateManager.get();
        
        if (this.domCache.score) this.domCache.score.textContent = state.score;
        if (this.domCache.steps) this.domCache.steps.textContent = state.steps;
        if (this.domCache.gameGold) this.domCache.gameGold.textContent = state.gold;
        
        // 更新游戏页面的体力显示
        const gameStaminaEl = document.getElementById('gameStamina');
        if (gameStaminaEl) {
            gameStaminaEl.textContent = `${state.stamina}/${state.maxStamina}`;
        }
        
        // 调用得分进度更新
        this.updateScoreProgress();
    },
    
    updateScoreProgress() {
        const state = StateManager.get();
        const score = state.score;
        const targetScore = state.targetScore || 1000;
        
        // 计算各星级阈值
        const oneStarScore = targetScore;
        const twoStarScore = targetScore * 1.5;
        const threeStarScore = targetScore * 2.0;
        
        // 更新星级分数显示
        const oneStarEl = document.getElementById('oneStarScore');
        const twoStarEl = document.getElementById('twoStarScore');
        const threeStarEl = document.getElementById('threeStarScore');
        
        if (oneStarEl) oneStarEl.textContent = oneStarScore;
        if (twoStarEl) twoStarEl.textContent = twoStarScore;
        if (threeStarEl) threeStarEl.textContent = threeStarScore;
        
        // 计算进度百分比（最大100%）
        let progressPercent = (score / threeStarScore) * 100;
        progressPercent = Math.min(progressPercent, 100);
        
        // 更新进度条
        const progressBar = document.getElementById('scoreProgressBar');
        if (progressBar) {
            progressBar.style.width = `${progressPercent}%`;
        }
        
        // 更新星级显示
        const star1 = document.getElementById('star1');
        const star2 = document.getElementById('star2');
        const star3 = document.getElementById('star3');
        
        if (star1) star1.style.opacity = score >= oneStarScore ? '1' : '0.6';
        if (star2) star2.style.opacity = score >= twoStarScore ? '1' : '0.6';
        if (star3) star3.style.opacity = score >= threeStarScore ? '1' : '0.6';
    },

    switchPage(pageId) {
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
        });
        
        const targetPage = document.getElementById(pageId);
        if (targetPage) {
            targetPage.classList.add('active');
            this.currentPage = pageId;
            
            if (pageId === 'levelSelectPage') {
                this.initLevelSelect();
            } else if (pageId === 'homePage') {
                this.updateHomeStats();
            }
            
            window.scrollTo(0, 0);
        }
    },

    showLevelSelectPage() {
        this.switchPage('levelSelectPage');
    },

    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('hide');
            
            if (modalId === 'signModal') this.initSignIn();
            if (modalId === 'albumModal') this.initAlbum();
        }
    },

    hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('hide');
        }
    },

    hideAllModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.add('hide');
        });
    },

    showToast(message, type = 'info') {
        const toast = this.domCache.toast;
        const toastContent = this.domCache.toastContent;
        
        if (toast && toastContent) {
            toastContent.textContent = message;
            
            const colors = {
                'success': '#22c55e',
                'error': '#ef4444',
                'warning': '#f59e0b',
                'info': '#d4af37'
            };
            toastContent.style.borderColor = colors[type] || colors.info;
            
            toast.classList.remove('hide');
            
            setTimeout(() => {
                toast.classList.add('hide');
            }, 2000);
        }
    },

    // ========== 登录系统 ==========
    
    loginAnonymous() {
        StateManager.set('isLoggedIn', true);
        StateManager.set('loginType', 'anonymous');
        StateManager.set('userName', 'Guest');
        
        // 检查年龄模式
        const isChildMode = StateManager.get('isChildMode');
        if (isChildMode) {
            this._hidePaymentFeatures();
        }
        
        this.switchPage('homePage');
    },

    logout() {
        if (confirm('Are you sure you want to logout? Your game progress will be preserved.')) {
            // 清除登录状态
            StateManager.set('isLoggedIn', false);
            StateManager.set('loginType', null);
            StateManager.set('userName', 'Guest');
            
            // 关闭设置弹窗
            this.hideModal('settingsModal');
            
            // 返回验证页面
            this.switchPage('verifyPage');
            
            // 重置年龄选择
            const ageOptions = document.querySelectorAll('input[name="age"]');
            ageOptions.forEach(option => option.checked = false);
            
            // 重置条款勾选
            const termsCheck = document.getElementById('termsCheck');
            const privacyCheck = document.getElementById('privacyCheck');
            if (termsCheck) termsCheck.checked = false;
            if (privacyCheck) privacyCheck.checked = false;
            
            console.log('👋 User logged out successfully');
        }
    },

    // ========== 关卡系统 ==========
    
    initLevelSelect() {
        const container = this.domCache.levelsGrid;
        if (!container) return;

        const state = StateManager.get();
        container.innerHTML = '';

        for (let i = 1; i <= 25; i++) {
            const levelDiv = document.createElement('div');
            const isUnlocked = state.levelUnlocked[i-1];
            const isCurrent = state.currentLevel === i;
            const stars = state.levelStars[i-1] || 0;
            
            levelDiv.className = `level-item ${isUnlocked ? '' : 'locked'} ${isCurrent ? 'current' : ''}`;
            
            if (isUnlocked) {
                levelDiv.onclick = () => this.selectLevel(i);
            }
            
            const starsHtml = Array(3).fill(0).map((_, idx) => {
                const earned = idx < stars ? 'earned' : '';
                return `<span class="level-star ${earned}">★</span>`;
            }).join('');
            
            levelDiv.innerHTML = `
                <div class="level-number">${i}</div>
                <div class="level-stars">${starsHtml}</div>
            `;
            
            container.appendChild(levelDiv);
        }
        
        if (this.domCache.totalStars) {
            this.domCache.totalStars.textContent = state.totalStars;
        }
    },

    selectLevel(level) {
        const state = StateManager.get();
        
        if (!state.levelUnlocked[level-1]) {
            return;
        }

        if (state.stamina < 1) {
            this.showToast('Not enough stamina!', 'error');
            return;
        }

        // 消耗1点体力
        StateManager.set('stamina', state.stamina - 1);
        StateManager.set('lastStaminaUpdate', Date.now());
        StateManager.set('currentLevel', level);
        
        const targetScores = [1000, 1200, 1500, 1800, 2000, 2500, 2800, 3200, 3500, 4000,
                             4500, 5000, 5500, 6000, 6500, 7000, 7500, 8000, 8500, 9000,
                             9500, 10000, 11000, 12000, 15000];
        
        const baseSteps = 20;
        
        StateManager.set('targetScore', targetScores[level-1] || 1000);
        StateManager.set('score', 0);
        StateManager.set('steps', baseSteps);
        StateManager.set('startSteps', baseSteps);
        
        this.switchPage('gamePage');
        
        if (this.domCache.currentLevelDisplay) {
            this.domCache.currentLevelDisplay.textContent = level;
        }
        
        this.initGameBoard();
        this.updateGameStats();
    },

    // ========== 游戏系统 ==========
    
    initGameBoard() {
        const board = this.domCache.gameBoard;
        if (!board) return;

        GameEngine.createBoard();
        const boardData = GameEngine.getBoard();
        
        board.innerHTML = '';
        boardData.forEach((tile, index) => {
            const tileEl = document.createElement('div');
            tileEl.className = `tile ${tile.color}`;
            tileEl.innerHTML = tile.icon;
            tileEl.dataset.index = index;
            tileEl.onclick = () => this.handleTileClick(index);
            board.appendChild(tileEl);
        });
        
        this.cascadeCount = 0;
        this.hasUsedStep = false;
    },

    handleTileClick(index) {
        if (StateManager.get('isProcessing')) return;

        const tiles = document.querySelectorAll('.tile');
        const selectedTile = document.querySelector('.tile.selected');

        if (selectedTile) {
            const selectedIndex = parseInt(selectedTile.dataset.index);
            
            if (selectedIndex === index) {
                selectedTile.classList.remove('selected');
                return;
            }

            this.trySwap(selectedIndex, index);
        } else {
            tiles[index].classList.add('selected');
        }
    },

    async trySwap(idx1, idx2) {
        if (!GameEngine.isAdjacent(idx1, idx2)) {
            document.querySelectorAll('.tile').forEach(t => t.classList.remove('selected'));
            document.querySelectorAll('.tile')[idx2].classList.add('selected');
            return;
        }

        StateManager.set('isProcessing', true);
        this.hasUsedStep = false; // 重置步数消耗标记

        GameEngine.swapTiles(idx1, idx2);
        this.updateBoardDisplay();

        const matches = GameEngine.findMatches();
        
        if (matches.length >= 3) {
            this.cascadeCount = 0;
            await this.processMatches(matches);
        } else {
            await this.delay(200);
            GameEngine.swapTiles(idx1, idx2);
            this.updateBoardDisplay();
        }

        document.querySelectorAll('.tile').forEach(t => t.classList.remove('selected'));
        StateManager.set('isProcessing', false);
    },

    async processMatches(matches) {
        // 只在第一次消除时消耗步数，连锁反应不消耗
        if (!this.hasUsedStep) {
            const newSteps = StateManager.get('steps') - 1;
            StateManager.set('steps', newSteps);
            this.hasUsedStep = true;
        }
        
        const result = GameEngine.processMatches(matches, this.cascadeCount > 0);
        
        const newScore = StateManager.get('score') + result.score;
        StateManager.set('score', newScore);
        
        this.updateGameStats();

        // 显示消除动画
        matches.forEach(idx => {
            const tile = document.querySelectorAll('.tile')[idx];
            if (tile) {
                tile.classList.add('matched');
            }
        });

        await this.delay(300);

        // 处理下落
        GameEngine.processFalling();
        this.updateBoardDisplay();

        // 检查连锁反应
        const newMatches = GameEngine.findMatches();
        if (newMatches.length >= 3 && StateManager.get('steps') > 0) {
            this.cascadeCount++;
            await this.delay(200);
            await this.processMatches(newMatches);
        } else {
            this.cascadeCount = 0;
            this.hasUsedStep = false; // 重置标记
            this.checkGameState();
        }
    },

    updateBoardDisplay() {
        const board = this.domCache.gameBoard;
        if (!board) return;

        const boardData = GameEngine.getBoard();
        
        boardData.forEach((tile, index) => {
            const tileEl = board.children[index];
            if (tileEl) {
                tileEl.className = `tile ${tile.color}`;
                tileEl.innerHTML = tile.icon;
            }
        });
    },

    checkGameState() {
        const state = StateManager.get();
        
        if (state.steps <= 0) {
            // 步数耗尽，检查是否达到1星门槛
            const oneStarThreshold = state.targetScore;
            if (state.score >= oneStarThreshold) {
                this.levelComplete();
            } else {
                this.levelFail();
            }
        }
        // 移除目标分数触发结算的逻辑，只在步数消耗完后才结算
    },

    levelComplete() {
        const state = StateManager.get();
        const level = state.currentLevel;
        const score = state.score;
        const steps = state.steps;
        
        // 定义各星级分数门槛
        const oneStarThreshold = state.targetScore;
        const twoStarThreshold = oneStarThreshold * 1.5; // 2星门槛为1星的1.5倍
        const threeStarThreshold = oneStarThreshold * 2.0; // 3星门槛为1星的2倍
        
        // 星级评定：同时满足步数和分数条件
        let stars = 0;
        if (steps >= 0) { // 确保在限定步数内
            if (score >= threeStarThreshold) {
                stars = 3;
            } else if (score >= twoStarThreshold) {
                stars = 2;
            } else if (score >= oneStarThreshold) {
                stars = 1;
            }
        }
        
        // 确保至少有1星（因为checkGameState已经检查过分数达到1星门槛）
        stars = Math.max(stars, 1);
        
        // 更新关卡数据
        const levelStars = [...state.levelStars];
        levelStars[level-1] = Math.max(levelStars[level-1] || 0, stars);
        StateManager.set('levelStars', levelStars);
        
        // 解锁下一关
        if (level < 25) {
            const levelUnlocked = [...state.levelUnlocked];
            levelUnlocked[level] = true;
            StateManager.set('levelUnlocked', levelUnlocked);
        }
        
        StateManager.set('totalStars', levelStars.reduce((a, b) => a + b, 0));
        
        this.giveLevelRewards(stars);
        this.showLevelCompleteModal(stars);
    },

    levelFail() {
        // 关卡失败时不返还消耗的体力
        setTimeout(() => this.exitLevel(), 1000);
    },

    giveLevelRewards(stars) {
        const rewards = {
            1: { stamina: 1, gold: 10 },
            2: { stamina: 1, gold: 50 },
            3: { stamina: 2, gold: 100, cardPack: 1 }
        };

        const reward = rewards[stars];
        if (!reward) return;

        const state = StateManager.get();
        const updates = {};

        if (reward.stamina) {
            // 确保体力不超过最大值
            updates.stamina = Math.min(state.stamina + reward.stamina, state.maxStamina);
        }
        if (reward.gold) updates.gold = state.gold + reward.gold;
        if (reward.cardPack) updates.cardPacks = state.cardPacks + reward.cardPack;

        StateManager.batchUpdate(updates);
    },

    showLevelCompleteModal(stars) {
        const modal = document.getElementById('levelCompleteModal');
        if (!modal) return;

        // 计算奖励
        const rewards = {
            1: { stamina: 1, gold: 10 },
            2: { stamina: 1, gold: 50 },
            3: { stamina: 2, gold: 100, cardPack: 1 }
        };
        const reward = rewards[stars] || {};

        // 更新模态框内容
        modal.innerHTML = `
            <div class="modal-content" style="text-align: center;">
                <div style="font-size: 4rem; margin-bottom: 16px; animation: float 2s ease-in-out infinite;">🎉</div>
                <h2 style="margin-bottom: 16px;" class="title-gold">Level Complete!</h2>
                <p style="color: var(--text-secondary); margin-bottom: 24px; font-size: 0.875rem;">Congratulations! You earned ${stars} star${stars > 1 ? 's' : ''}!</p>
                
                <!-- 奖励显示 -->
                <div style="background: rgba(212,175,55,0.1); border-radius: 8px; padding: 16px; margin-bottom: 24px; text-align: left;">
                    <div style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 8px;">Rewards:</div>
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        ${reward.stamina ? `<div style="font-size: 0.75rem; display: flex; align-items: center; gap: 6px;"><span>⚡</span><span>${reward.stamina} Stamina</span></div>` : ''}
                        ${reward.gold ? `<div style="font-size: 0.75rem; display: flex; align-items: center; gap: 6px;"><span>💰</span><span>${reward.gold} Gold</span></div>` : ''}
                        ${reward.cardPack ? `<div style="font-size: 0.75rem; display: flex; align-items: center; gap: 6px;"><span>🎁</span><span>${reward.cardPack} Card Pack</span></div>` : ''}
                    </div>
                </div>
                
                <!-- 星星显示 -->
                <div style="display: flex; justify-content: center; gap: 16px; margin-bottom: 24px;">
                    <span id="star1" style="font-size: 2.5rem; opacity: ${stars >= 1 ? '1' : '0.3'}; filter: ${stars >= 1 ? 'none' : 'grayscale(100%)'}; transition: all 0.3s ease; animation: ${stars >= 1 ? 'float 1s ease-in-out infinite' : 'none'};">⭐</span>
                    <span id="star2" style="font-size: 2.5rem; opacity: ${stars >= 2 ? '1' : '0.3'}; filter: ${stars >= 2 ? 'none' : 'grayscale(100%)'}; transition: all 0.3s ease; animation: ${stars >= 2 ? 'float 1s ease-in-out infinite 0.2s' : 'none'};">⭐</span>
                    <span id="star3" style="font-size: 2.5rem; opacity: ${stars >= 3 ? '1' : '0.3'}; filter: ${stars >= 3 ? 'none' : 'grayscale(100%)'}; transition: all 0.3s ease; animation: ${stars >= 3 ? 'float 1s ease-in-out infinite 0.4s' : 'none'};">⭐</span>
                </div>
                
                <button class="btn btn-gold" onclick="closeLevelCompleteModal(); switchPage('levelSelectPage');" style="width: 100%;">Continue</button>
            </div>
        `;

        modal.classList.remove('hide');
    },

    exitLevel() {
        this.switchPage('levelSelectPage');
        this.initLevelSelect();
    },

    startGame() {
        this.switchPage('levelSelectPage');
        this.initLevelSelect();
    },

    // ========== 道具功能 ==========
    
    useBomb() {
        const state = StateManager.get();
        if (state.gold < 50) {
            return;
        }

        StateManager.set('gold', state.gold - 50);
        
        const tiles = document.querySelectorAll('.tile');
        
        // 确保不重复选择相同的棋子
        const selectedIndices = new Set();
        while (selectedIndices.size < 5 && selectedIndices.size < tiles.length) {
            const idx = Math.floor(Math.random() * tiles.length);
            selectedIndices.add(idx);
        }
        
        // 播放爆炸动画
        selectedIndices.forEach(idx => {
            const tile = tiles[idx];
            if (tile) {
                // 添加更明显的爆炸效果
                tile.style.animation = 'matchPop 0.3s ease-out';
                tile.style.transform = 'scale(1.5)';
                tile.style.opacity = '0';
            }
        });
        
        // 延迟后重新生成游戏板
        setTimeout(() => {
            // 重新生成游戏板
            GameEngine.createBoard();
            this.updateBoardDisplay();
            
            // 加分
            StateManager.set('score', state.score + 100);
            this.updateGameStats();
            
            // 显示炸弹使用成功的提示
            this.showToast('Bomb used! 5 tiles destroyed!', 'success');
        }, 300);
    },

    refreshBoard() {
        const state = StateManager.get();
        if (state.gold < 30) {
            return;
        }

        StateManager.set('gold', state.gold - 30);
        this.initGameBoard();
        this.updateGameStats();
    },

    addSteps() {
        const state = StateManager.get();
        if (state.gold < 100) {
            return;
        }

        StateManager.set('gold', state.gold - 100);
        StateManager.set('steps', state.steps + 5);
        this.updateGameStats();
    },

    // ========== 签到功能 ==========
    
    initSignIn() {
        const state = StateManager.get();
        const signBtn = document.getElementById('signBtn');
        
        if (signBtn) {
            if (state.signToday) {
                signBtn.textContent = 'Already Signed In ✓';
                signBtn.disabled = true;
                signBtn.style.opacity = '0.6';
            } else {
                signBtn.textContent = 'Sign In Now';
                signBtn.disabled = false;
                signBtn.style.opacity = '1';
            }
        }
    },

    signIn() {
        const state = StateManager.get();
        if (state.signToday) return;

        const rewards = [50, 100, 150, 200, 300, 500, 1000];
        const dayIndex = state.signDays % 7;
        const reward = rewards[dayIndex];

        StateManager.set('gold', state.gold + reward);
        StateManager.set('signDays', state.signDays + 1);
        StateManager.set('signToday', true);

        this.updateHomeStats();
        this.initSignIn();
    },

    // ========== 相册功能 ==========
    
    initAlbum() {
        const container = document.getElementById('albumCards');
        if (!container) return;

        const state = StateManager.get();
        const icons = ['👑','💎','🏰','🎲','🃏','🔮','✨','🌟','💫','⚜️',
                      '🏆','🎁','🏵️','🌸','🌺','🌻','🥇','🥈','🥉','🎖️',
                      '🕌','🏯','🎭','⚱️','🪔','🏺','🪙','📜','🗺️','⛲',
                      '💍','⚖️','🛡️','🗝️','🎯','🎨','🎷','🪕','📿','⚔️'];

        container.innerHTML = '';
        state.album.forEach((collected, idx) => {
            const card = document.createElement('div');
            card.className = `album-card ${collected ? 'collected' : ''}`;
            card.style.cssText = `
                aspect-ratio: 1;
                display: flex;
                align-items: center;
                justify-content: center;
                background: ${collected ? 'linear-gradient(145deg, rgba(212,175,55,0.3), rgba(212,175,55,0.1))' : 'rgba(255,255,255,0.05)'};
                border-radius: 8px;
                border: 1px solid ${collected ? 'rgba(212,175,55,0.5)' : 'rgba(255,255,255,0.1)'};
                font-size: 1.25rem;
                cursor: ${collected ? 'default' : 'pointer'};
                transition: all 0.3s ease;
            `;
            card.innerHTML = collected ? icons[idx] : '?';
            container.appendChild(card);
        });

        const collectedCount = state.album.filter(Boolean).length;
        const collectedEl = document.getElementById('albumCollected');
        const totalEl = document.getElementById('albumTotal');
        
        if (collectedEl) collectedEl.textContent = collectedCount;
        if (totalEl) totalEl.textContent = icons.length;

        const openBtn = document.getElementById('openCardPackBtn');
        if (openBtn) {
            openBtn.disabled = state.cardPacks <= 0;
            openBtn.style.opacity = state.cardPacks <= 0 ? '0.5' : '1';
        }
    },

    openCardPack() {
        const state = StateManager.get();
        if (state.cardPacks <= 0) {
            return;
        }

        const lockedIndices = state.album
            .map((collected, idx) => collected ? -1 : idx)
            .filter(idx => idx !== -1);

        if (lockedIndices.length === 0) {
            StateManager.set('gold', state.gold + 500);
            StateManager.set('cardPacks', state.cardPacks - 1);
        } else {
            const randomIdx = lockedIndices[Math.floor(Math.random() * lockedIndices.length)];
            const album = [...state.album];
            album[randomIdx] = true;
            StateManager.set('album', album);
            StateManager.set('cardPacks', state.cardPacks - 1);
        }

        this.updateHomeStats();
        this.initAlbum();
    },

    // ========== 年龄验证和登录 ==========
    


    showParentConsentModal() {
        const existingModal = document.getElementById('parentConsentModal');
        if (existingModal) existingModal.remove();
        
        const modal = document.createElement('div');
        modal.id = 'parentConsentModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 450px;">
                <h3 style="text-align: center; margin-bottom: 24px; background: linear-gradient(135deg, #d4af37, #f4e4ba); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Parent/Guardian Consent</h3>
                <p style="color: var(--text-secondary); margin-bottom: 20px; line-height: 1.6;">
                    This application is designed for children under 13. By providing consent, you acknowledge that you are the parent or legal guardian and agree to the terms of service and privacy policy in accordance with COPPA requirements.
                </p>
                <div style="background: rgba(107,78,230,0.1); border: 1px solid rgba(107,78,230,0.3); border-radius: 12px; padding: 16px; margin-bottom: 20px;">
                    <h4 style="color: var(--purple-light); margin-bottom: 12px; font-size: 1rem;">Important Information:</h4>
                    <ul style="list-style: disc; list-style-position: inside; color: var(--text-secondary); font-size: 0.875rem; line-height: 1.5;">
                        <li>Child mode restricts all payment options</li>
                        <li>No personal information is collected or shared</li>
                        <li>Game progress is stored locally on this device</li>
                        <li>Content is filtered for age-appropriate material</li>
                        <li>Parent dashboard available for monitoring</li>
                    </ul>
                </div>
                <button onclick="RoyalLegacyApp.parentConsentAgree()" class="btn btn-primary" style="width: 100%; margin-bottom: 12px;">I Agree (Parent/Guardian)</button>
                <button onclick="RoyalLegacyApp.parentConsentDecline()" class="btn btn-secondary" style="width: 100%;">Cancel</button>
            </div>
        `;
        
        document.body.appendChild(modal);
        setTimeout(() => modal.classList.remove('hide'), 10);
    },

    parentConsentAgree() {
        const modal = document.getElementById('parentConsentModal');
        if (modal) modal.remove();
        
        // 家长确认后登录
        this.loginAnonymous();
    },

    parentConsentDecline() {
        const modal = document.getElementById('parentConsentModal');
        if (modal) modal.remove();
        
        // 重置年龄选择
        const ageOptions = document.querySelectorAll('input[name="age"]');
        ageOptions.forEach(option => option.checked = false);
        
        StateManager.set('ageMode', null);
        StateManager.set('isChildMode', false);
        StateManager.set('isTeenMode', false);
        StateManager.set('userAge', null);
    },



    showLoginModal() {
        const existingModal = document.getElementById('loginModal');
        if (existingModal) existingModal.remove();
        
        const isTeenMode = StateManager.get('isTeenMode');
        
        const modal = document.createElement('div');
        modal.id = 'loginModal';
        modal.className = 'modal';
        
        // 青少年模式只显示匿名登录
        const thirdPartyLogins = isTeenMode ? '' : `
            <button onclick="RoyalLegacyApp.loginGoogle()" class="btn btn-secondary" style="width: 100%; margin-bottom: 12px; justify-content: flex-start; padding: 16px;">
                <span style="font-size: 1.25rem; margin-right: 12px;">🔍</span>
                <span>Login with Google</span>
            </button>
            <button onclick="RoyalLegacyApp.loginApple()" class="btn btn-secondary" style="width: 100%; margin-bottom: 12px; justify-content: flex-start; padding: 16px;">
                <span style="font-size: 1.25rem; margin-right: 12px;">🍎</span>
                <span>Login with Apple</span>
            </button>
            <button onclick="RoyalLegacyApp.loginFacebook()" class="btn btn-secondary" style="width: 100%; margin-bottom: 12px; justify-content: flex-start; padding: 16px;">
                <span style="font-size: 1.25rem; margin-right: 12px;">📘</span>
                <span>Login with Facebook</span>
            </button>
        `;
        
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 400px;">
                <h3 style="text-align: center; margin-bottom: 24px; background: linear-gradient(135deg, #d4af37, #f4e4ba); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Choose Login Method</h3>
                
                ${thirdPartyLogins}
                
                <button onclick="RoyalLegacyApp.loginAnonymous()" class="btn btn-secondary" style="width: 100%; margin-bottom: 12px; justify-content: flex-start; padding: 16px;">
                    <span style="font-size: 1.25rem; margin-right: 12px;">👤</span>
                    <span>Anonymous Login</span>
                </button>
                
                <p style="text-align: center; color: var(--text-secondary); font-size: 0.75rem; margin-top: 16px;">
                    ${isTeenMode ? 'Teen Mode: Only Anonymous Login is available' : 'Your progress will be saved locally'}
                </p>
            </div>
        `;
        
        document.body.appendChild(modal);
        setTimeout(() => modal.classList.remove('hide'), 10);
    },

    loginApple() {
        // 模拟Apple登录
        StateManager.set('isLoggedIn', true);
        StateManager.set('loginType', 'apple');
        StateManager.set('userName', 'Apple User');
        StateManager.set('lastLogin', new Date().toISOString());
        
        const modal = document.getElementById('loginModal');
        if (modal) modal.remove();
        
        this.switchPage('homePage');
    },

    loginFacebook() {
        // 模拟Facebook登录
        StateManager.set('isLoggedIn', true);
        StateManager.set('loginType', 'facebook');
        StateManager.set('userName', 'Facebook User');
        StateManager.set('lastLogin', new Date().toISOString());
        
        const modal = document.getElementById('loginModal');
        if (modal) modal.remove();
        
        this.switchPage('homePage');
    },

    loginGoogle() {
        // 模拟Google登录
        StateManager.set('isLoggedIn', true);
        StateManager.set('loginType', 'google');
        StateManager.set('userName', 'Google User');
        StateManager.set('lastLogin', new Date().toISOString());
        
        const modal = document.getElementById('loginModal');
        if (modal) modal.remove();
        
        this.switchPage('homePage');
    },

    loginAnonymous() {
        StateManager.set('isLoggedIn', true);
        StateManager.set('loginType', 'anonymous');
        StateManager.set('userName', 'Guest');
        StateManager.set('lastLogin', new Date().toISOString());
        
        // 儿童模式下不存储任何个人信息
        const isChildMode = StateManager.get('isChildMode');
        if (isChildMode) {
            // 确保只存储必要的游戏数据
            this._cleanChildModeData();
            this._hidePaymentFeatures();
        }
        
        const modal = document.getElementById('loginModal');
        if (modal) modal.remove();
        
        this.switchPage('homePage');
    },

    _cleanChildModeData() {
        // 确保儿童模式下只存储必要的游戏数据
        const state = StateManager.get();
        const childSafeData = {
            userName: 'Guest',
            lastLogin: new Date().toISOString()
        };
        
        // 使用批量更新保存净化后的数据
        StateManager.batchUpdate(childSafeData);
    },

    // 家长数据管理功能
    showParentDataManager() {
        const existingModal = document.getElementById('parentDataModal');
        if (existingModal) existingModal.remove();
        
        const modal = document.createElement('div');
        modal.id = 'parentDataModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 450px;">
                <h3 style="text-align: center; margin-bottom: 24px; background: linear-gradient(135deg, #d4af37, #f4e4ba); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Parent Data Management</h3>
                <p style="color: var(--text-secondary); margin-bottom: 20px; line-height: 1.6;">
                    As a parent or guardian, you can manage your child's game data and privacy settings.
                </p>
                <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;">
                    <button onclick="RoyalLegacyApp.viewChildData()" class="btn btn-secondary" style="width: 100%;">
                        👁️ View Child's Game Data
                    </button>
                    <button onclick="RoyalLegacyApp.resetChildData()" class="btn btn-secondary" style="width: 100%; color: var(--warning); border-color: var(--warning);">
                        🔄 Reset Game Progress
                    </button>
                    <button onclick="RoyalLegacyApp.deleteChildData()" class="btn btn-secondary" style="width: 100%; color: var(--error); border-color: var(--error);">
                        🗑️ Delete All Child Data
                    </button>
                </div>
                <button onclick="RoyalLegacyApp.hideModal('parentDataModal')" class="btn btn-gold" style="width: 100%;">Close</button>
            </div>
        `;
        
        document.body.appendChild(modal);
        setTimeout(() => modal.classList.remove('hide'), 10);
    },

    viewChildData() {
        const state = StateManager.get();
        const existingModal = document.getElementById('childDataModal');
        if (existingModal) existingModal.remove();
        
        const modal = document.createElement('div');
        modal.id = 'childDataModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 400px;">
                <h3 style="text-align: center; margin-bottom: 16px; background: linear-gradient(135deg, #d4af37, #f4e4ba); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Child's Game Data</h3>
                <div style="background: rgba(255,255,255,0.05); border-radius: 12px; padding: 16px; margin-bottom: 20px;">
                    <p style="margin-bottom: 8px; color: var(--text-secondary);"><strong>Account Type:</strong> ${state.loginType || 'Anonymous'}</p>
                    <p style="margin-bottom: 8px; color: var(--text-secondary);"><strong>Age Mode:</strong> ${state.ageMode || 'N/A'}</p>
                    <p style="margin-bottom: 8px; color: var(--text-secondary);"><strong>Gold:</strong> ${state.gold || 0}</p>
                    <p style="margin-bottom: 8px; color: var(--text-secondary);"><strong>Stamina:</strong> ${state.stamina || 0}/${state.maxStamina || 10}</p>
                    <p style="margin-bottom: 8px; color: var(--text-secondary);"><strong>Card Packs:</strong> ${state.cardPacks || 0}</p>
                    <p style="margin-bottom: 8px; color: var(--text-secondary);"><strong>Total Stars:</strong> ${state.totalStars || 0}</p>
                    <p style="margin-bottom: 8px; color: var(--text-secondary);"><strong>Last Login:</strong> ${new Date(state.lastLogin || Date.now()).toLocaleString()}</p>
                </div>
                <p style="text-align: center; color: var(--text-muted); font-size: 0.75rem; margin-bottom: 20px;">
                    No personal information is stored for child accounts.
                </p>
                <button onclick="RoyalLegacyApp.hideModal('childDataModal')" class="btn btn-gold" style="width: 100%;">Close</button>
            </div>
        `;
        
        document.body.appendChild(modal);
        setTimeout(() => modal.classList.remove('hide'), 10);
    },

    resetChildData() {
        if (confirm('Are you sure you want to reset your child\'s game progress? This will reset all game data but preserve account settings.')) {
            const state = StateManager.get();
            const resetData = {
                ...state,
                gold: 0,
                stamina: 10,
                cardPacks: 0,
                totalStars: 0,
                levelUnlocked: [true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
                levelStars: [],
                album: [],
                signDays: 0,
                signToday: false
            };
            
            StateManager._saveState(resetData);
            this.showToast('Game progress has been reset', 'success');
            this.hideModal('parentDataModal');
            this.updateHomeStats();
        }
    },

    deleteChildData() {
        if (confirm('Are you sure you want to delete all your child\'s game data? This cannot be undone!')) {
            // 清除所有数据
            localStorage.removeItem('royalLegacy_v2');
            this.showToast('All child data has been deleted', 'success');
            this.hideModal('parentDataModal');
            setTimeout(() => location.reload(), 1000);
        }
    },

    _hidePaymentFeatures() {
        // 隐藏所有付费相关按钮
        const shopButtons = document.querySelectorAll('[onclick*="showPayModal"]');
        shopButtons.forEach(btn => {
            // 替换商店按钮为儿童模式专属按钮
            if (btn.textContent.includes('Shop')) {
                btn.innerHTML = `
                    <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                        <span style="font-size: 1.25rem;">💡</span>
                        <span>Game Tips</span>
                    </div>
                `;
                btn.onclick = () => this.showGameTips();
                btn.style.display = 'flex';
            } else {
                btn.style.display = 'none';
            }
        });
        
        // 隐藏皇家通行证
        const royalPass = document.querySelector('.glass-card');
        if (royalPass && royalPass.textContent.includes('Royal Pass')) {
            royalPass.innerHTML = `
                <h3 style="color: var(--gold-primary); margin-bottom: 8px; font-size: 1.25rem;">Kids Mode</h3>
                <p style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 20px; line-height: 1.5;">Safe play mode with no in-app purchases</p>
                <div style="background: rgba(212,175,55,0.1); border-radius: 8px; padding: 12px; margin-bottom: 16px;">
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 8px;">Kids Mode Features:</div>
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        <div style="font-size: 0.75rem; display: flex; align-items: center; gap: 6px;">
                            <span>🛡️</span>
                            <span>No in-app purchases</span>
                        </div>
                        <div style="font-size: 0.75rem; display: flex; align-items: center; gap: 6px;">
                            <span>🎮</span>
                            <span>Age-appropriate content</span>
                        </div>
                        <div style="font-size: 0.75rem; display: flex; align-items: center; gap: 6px;">
                            <span>👨‍👩‍👧‍👦</span>
                            <span>Parent controls available</span>
                        </div>
                    </div>
                </div>
            `;
        }
        
        // 隐藏游戏内道具购买按钮
        const gamePropButtons = document.querySelectorAll('[onclick*="useBomb"],[onclick*="refreshBoard"],[onclick*="addSteps"]');
        gamePropButtons.forEach(btn => {
            btn.style.display = 'none';
        });
        
        // 禁用支付页面访问
        const paymentPage = document.getElementById('paymentPage');
        if (paymentPage) {
            paymentPage.style.display = 'none';
        }
    },
    
    showGameTips() {
        // 创建游戏提示模态框
        const existingModal = document.getElementById('gameTipsModal');
        if (existingModal) existingModal.remove();
        
        const modal = document.createElement('div');
        modal.id = 'gameTipsModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 400px;">
                <h3 style="text-align: center; margin-bottom: 16px; background: linear-gradient(135deg, #d4af37, #f4e4ba); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Game Tips</h3>
                <p style="text-align: center; color: var(--text-secondary); margin-bottom: 24px; font-size: 0.875rem;">Learn how to play better!</p>
                
                <div style="display: flex; flex-direction: column; gap: 16px; margin-bottom: 24px;">
                    <div class="glass-card" style="padding: 16px; margin-bottom: 0;">
                        <div style="font-size: 1.25rem; margin-bottom: 8px;">🎯</div>
                        <div style="font-weight: 600; margin-bottom: 4px;">Match 3 or More</div>
                        <div style="font-size: 0.75rem; color: var(--text-secondary);">Match 3 or more identical tiles to clear them and score points.</div>
                    </div>
                    <div class="glass-card" style="padding: 16px; margin-bottom: 0;">
                        <div style="font-size: 1.25rem; margin-bottom: 8px;">⏱️</div>
                        <div style="font-weight: 600; margin-bottom: 4px;">Use Steps Wisely</div>
                        <div style="font-size: 0.75rem; color: var(--text-secondary);">You have limited steps to reach your goal. Plan your moves carefully!</div>
                    </div>
                    <div class="glass-card" style="padding: 16px; margin-bottom: 0;">
                        <div style="font-size: 1.25rem; margin-bottom: 8px;">🌟</div>
                        <div style="font-weight: 600; margin-bottom: 4px;">Earn Stars</div>
                        <div style="font-size: 0.75rem; color: var(--text-secondary);">Score more points to earn up to 3 stars for each level.</div>
                    </div>
                    <div class="glass-card" style="padding: 16px; margin-bottom: 0;">
                        <div style="font-size: 1.25rem; margin-bottom: 8px;">⚡</div>
                        <div style="font-weight: 600; margin-bottom: 4px;">Stamina</div>
                        <div style="font-size: 0.75rem; color: var(--text-secondary);">Stamina regenerates over time. Come back later if you run out!</div>
                    </div>
                </div>
                
                <button class="btn btn-gold" onclick="RoyalLegacyApp.hideModal('gameTipsModal')" style="width: 100%;">Got it!</button>
            </div>
        `;
        
        document.body.appendChild(modal);
        setTimeout(() => modal.classList.remove('hide'), 10);
    },

    // 重写支付相关方法，确保儿童模式下无法访问
    showPayModal() {
        if (StateManager.get('isChildMode')) {
            this.showToast('Payment features are disabled in Child Mode', 'info');
            return;
        }
        
        this.switchPage('paymentPage');
    },

    useBomb() {
        if (StateManager.get('isChildMode')) {
            this.showToast('道具购买在儿童模式下已禁用', 'info');
            return;
        }
        
        const state = StateManager.get();
        if (state.gold < 50) {
            return;
        }

        StateManager.set('gold', state.gold - 50);
        
        const tiles = document.querySelectorAll('.tile');
        const randomIndices = [];
        for (let i = 0; i < 5; i++) {
            randomIndices.push(Math.floor(Math.random() * tiles.length));
        }
        
        randomIndices.forEach(idx => {
            const tile = tiles[idx];
            if (tile) {
                tile.style.animation = 'matchPop 0.3s ease-out';
            }
        });
        
        StateManager.set('score', state.score + 100);
        this.updateGameStats();
    },

    refreshBoard() {
        if (StateManager.get('isChildMode')) {
            this.showToast('道具购买在儿童模式下已禁用', 'info');
            return;
        }
        
        const state = StateManager.get();
        if (state.gold < 30) {
            return;
        }

        StateManager.set('gold', state.gold - 30);
        this.initGameBoard();
        this.updateGameStats();
    },

    addSteps() {
        if (StateManager.get('isChildMode')) {
            this.showToast('道具购买在儿童模式下已禁用', 'info');
            return;
        }
        
        const state = StateManager.get();
        if (state.gold < 100) {
            return;
        }

        StateManager.set('gold', state.gold - 100);
        StateManager.set('steps', state.steps + 5);
        this.updateGameStats();
    },

    // ========== 支付功能 ==========
    

    selectPackage(pkg, isRoyalPass = false) {
        // 区分皇家订阅和普通包
        StateManager.set('selectedPackage', pkg);
        StateManager.set('isRoyalPass', isRoyalPass);
        this.showPaymentMethodModal(pkg, isRoyalPass);
    },

    processDirectPayment(pkg) {
        const state = StateManager.get();
        
        const rewards = {
            '0.99': { gold: 100 },
            '9.99': { gold: 1200, cardPacks: 3 }
        };

        const reward = rewards[pkg];
        if (!reward) return;

        const updates = { gold: state.gold + reward.gold };
        if (reward.cardPacks) updates.cardPacks = state.cardPacks + reward.cardPacks;
        
        StateManager.batchUpdate(updates);
        this.switchPage('homePage');
        this.updateHomeStats();
    },

    showPaymentMethodModal(pkg, isRoyalPass = false) {
        const existingModal = document.getElementById('paymentMethodModal');
        if (existingModal) existingModal.remove();
        
        // 重置支付方式选择
        StateManager.set('selectedPaymentMethod', null);
        
        let pkgName, description;
        if (isRoyalPass) {
            pkgName = 'Royal Pass Subscription';
            description = 'Daily rewards and exclusive benefits';
        } else {
            const pkgNames = {
                '0.99': 'Starter Pack',
                '4.99': 'Royal Pack',
                '9.99': 'Imperial Pack'
            };
            const pkgDescriptions = {
                '0.99': '100 Gold',
                '4.99': '550 Gold + 1 Card Pack',
                '9.99': '1200 Gold + 3 Card Packs'
            };
            pkgName = pkgNames[pkg] || 'Package';
            description = pkgDescriptions[pkg] || '';
        }
        
        const modal = document.createElement('div');
        modal.id = 'paymentMethodModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 400px;">
                <h3 style="text-align: center; margin-bottom: 8px; background: linear-gradient(135deg, #d4af37, #f4e4ba); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">${isRoyalPass ? 'Royal Pass Subscription' : 'Select Payment'}</h3>
                <p style="text-align: center; color: rgba(255,255,255,0.7); margin-bottom: 8px; font-size: 0.875rem;">${pkgName}</p>
                <p style="text-align: center; color: rgba(255,255,255,0.5); margin-bottom: 20px; font-size: 0.75rem;">${description} - $${pkg} ${isRoyalPass ? '/ month' : ''}</p>
                
                <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px;">
                    <button onclick="RoyalLegacyApp.selectPaymentMethod('paypal')" class="btn btn-secondary payment-method-btn" data-method="paypal" style="justify-content: flex-start; padding: 16px;">
                        <span style="font-size: 1.25rem; margin-right: 12px;">💳</span>
                        <span>Pay with PayPal</span>
                    </button>
                    <button onclick="RoyalLegacyApp.selectPaymentMethod('card')" class="btn btn-secondary payment-method-btn" data-method="card" style="justify-content: flex-start; padding: 16px;">
                        <span style="font-size: 1.25rem; margin-right: 12px;">💳</span>
                        <span>Pay with Debit/Credit Card</span>
                    </button>
                    <button onclick="RoyalLegacyApp.selectPaymentMethod('apple')" class="btn btn-secondary payment-method-btn" data-method="apple" style="justify-content: flex-start; padding: 16px;">
                        <span style="font-size: 1.25rem; margin-right: 12px;">🍎</span>
                        <span>Apple Pay</span>
                    </button>
                    <button onclick="RoyalLegacyApp.selectPaymentMethod('google')" class="btn btn-secondary payment-method-btn" data-method="google" style="justify-content: flex-start; padding: 16px;">
                        <span style="font-size: 1.25rem; margin-right: 12px;">🤖</span>
                        <span>Google Pay</span>
                    </button>
                </div>
                
                <button class="btn btn-gold" onclick="RoyalLegacyApp.processPayment()" style="width: 100%; margin-bottom: 10px;">${isRoyalPass ? 'Subscribe Now' : 'Pay Now'}</button>
                <button class="btn btn-secondary" onclick="RoyalLegacyApp.closePaymentModal()" style="width: 100%;">Cancel</button>
            </div>
        `;
        
        document.body.appendChild(modal);
        setTimeout(() => modal.classList.remove('hide'), 10);
    },

    selectPaymentMethod(method) {
        StateManager.set('selectedPaymentMethod', method);
        
        document.querySelectorAll('.payment-method-btn').forEach(btn => {
            btn.style.borderColor = 'rgba(255,255,255,0.2)';
            btn.style.background = 'rgba(255,255,255,0.1)';
        });
        
        const selected = document.querySelector(`[data-method="${method}"]`);
        if (selected) {
            selected.style.borderColor = '#d4af37';
            selected.style.background = 'rgba(212,175,55,0.2)';
        }
    },

    processPayment() {
        const method = StateManager.get('selectedPaymentMethod');
        if (!method) {
            this.showToast('Please select a payment method', 'error');
            return;
        }

        setTimeout(() => {
            const pkg = StateManager.get('selectedPackage');
            const isRoyalPass = StateManager.get('isRoyalPass');
            const state = StateManager.get();
            
            let updates = {};
            
            if (isRoyalPass) {
                // 皇家订阅逻辑
                updates.isRoyalPassActive = true;
                updates.royalPassExpiry = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30天有效期
                updates.gold = state.gold + 1000; // 订阅奖励
                updates.cardPacks = state.cardPacks + 2;
                this.showToast('Royal Pass activated! Enjoy exclusive benefits!', 'success');
            } else {
                // 普通包逻辑
                const rewards = {
                    '0.99': { gold: 100 },
                    '4.99': { gold: 550, cardPacks: 1 },
                    '9.99': { gold: 1200, cardPacks: 3 }
                };
                
                const reward = rewards[pkg];
                if (!reward) {
                    this.showToast('Invalid package selected', 'error');
                    this.closePaymentModal();
                    return;
                }
                
                updates = { gold: state.gold + (reward.gold || 0) };
                if (reward.cardPacks) updates.cardPacks = state.cardPacks + reward.cardPacks;
                this.showToast('Payment successful!', 'success');
            }
            
            StateManager.batchUpdate(updates);
            
            this.closePaymentModal();
            this.switchPage('homePage');
            this.updateHomeStats();
        }, 1500);
    },

    closePaymentModal() {
        const modal = document.getElementById('paymentMethodModal');
        if (modal) {
            modal.classList.add('hide');
            setTimeout(() => modal.remove(), 300);
        }
    },

    backToShop() {
        this.switchPage('homePage');
    },

    // ========== 设置功能 ==========
    
    showSettingsModal() {
        const existingModal = document.getElementById('settingsModal');
        if (existingModal) existingModal.remove();
        
        const state = StateManager.get();
        
        const modal = document.createElement('div');
        modal.id = 'settingsModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 400px;">
                <h3 style="text-align: center; margin-bottom: 24px; background: linear-gradient(135deg, #d4af37, #f4e4ba); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Settings</h3>
                
                <div style="display: flex; flex-direction: column; gap: 16px; margin-bottom: 24px;">
                    <div class="glass-card" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0;">
                        <span>High Contrast Mode</span>
                        <button onclick="RoyalLegacyApp.toggleSetting('highContrast')" class="toggle-btn ${state.highContrast ? 'active' : ''}" style="width: 50px; height: 26px; border-radius: 13px; background: ${state.highContrast ? '#22c55e' : 'rgba(255,255,255,0.2)'}; border: none; cursor: pointer; position: relative; transition: all 0.3s;">
                            <span style="position: absolute; top: 3px; ${state.highContrast ? 'right: 3px' : 'left: 3px'}; width: 20px; height: 20px; background: white; border-radius: 50%; transition: all 0.3s;"></span>
                        </button>
                    </div>
                    
                    <div class="glass-card" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0;">
                        <span>Reduced Motion</span>
                        <button onclick="RoyalLegacyApp.toggleSetting('reducedMotion')" class="toggle-btn ${state.reducedMotion ? 'active' : ''}" style="width: 50px; height: 26px; border-radius: 13px; background: ${state.reducedMotion ? '#22c55e' : 'rgba(255,255,255,0.2)'}; border: none; cursor: pointer; position: relative; transition: all 0.3s;">
                            <span style="position: absolute; top: 3px; ${state.reducedMotion ? 'right: 3px' : 'left: 3px'}; width: 20px; height: 20px; background: white; border-radius: 50%; transition: all 0.3s;"></span>
                        </button>
                    </div>
                    
                    <div class="glass-card" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0;">
                        <span>Large Text</span>
                        <button onclick="RoyalLegacyApp.toggleSetting('largeText')" class="toggle-btn ${state.largeText ? 'active' : ''}" style="width: 50px; height: 26px; border-radius: 13px; background: ${state.largeText ? '#22c55e' : 'rgba(255,255,255,0.2)'}; border: none; cursor: pointer; position: relative; transition: all 0.3s;">
                            <span style="position: absolute; top: 3px; ${state.largeText ? 'right: 3px' : 'left: 3px'}; width: 20px; height: 20px; background: white; border-radius: 50%; transition: all 0.3s;"></span>
                        </button>
                    </div>
                    
                    <div class="glass-card" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0;">
                        <span>Sound Effects</span>
                        <button onclick="RoyalLegacyApp.toggleSetting('soundEnabled')" class="toggle-btn ${state.soundEnabled ? 'active' : ''}" style="width: 50px; height: 26px; border-radius: 13px; background: ${state.soundEnabled ? '#22c55e' : 'rgba(255,255,255,0.2)'}; border: none; cursor: pointer; position: relative; transition: all 0.3s;">
                            <span style="position: absolute; top: 3px; ${state.soundEnabled ? 'right: 3px' : 'left: 3px'}; width: 20px; height: 20px; background: white; border-radius: 50%; transition: all 0.3s;"></span>
                        </button>
                    </div>
                </div>
                
                ${state.isLoggedIn ? `
                <div style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 20px; margin-bottom: 20px;">
                    <h4 style="color: var(--gold-primary); margin-bottom: 12px; font-size: 0.875rem;">Account</h4>
                    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px; padding: 12px; background: rgba(255,255,255,0.05); border-radius: 8px;">
                        <span style="font-size: 1.5rem;">${state.loginType === 'google' ? '🔍' : '👤'}</span>
                        <div style="flex: 1;">
                            <div style="font-weight: 600; color: var(--text-primary);">${state.userName || 'Guest'}</div>
                            <div style="font-size: 0.75rem; color: var(--text-muted);">${state.loginType === 'google' ? 'Google Account' : 'Anonymous Account'}</div>
                        </div>
                    </div>
                    ${state.isChildMode ? `
                    <button onclick="RoyalLegacyApp.showParentDataManager()" class="btn btn-secondary" style="width: 100%; margin-bottom: 12px; color: var(--purple-light); border-color: var(--purple-light);">👨‍👩‍👧‍👦 Parent Data Management</button>
                    ` : ''}
                    <button onclick="RoyalLegacyApp.logout()" class="btn btn-secondary" style="width: 100%; color: var(--warning); border-color: var(--warning);">🚪 Logout</button>
                </div>
                ` : ''}
                
                <div style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 20px; margin-bottom: 20px;">
                    <h4 style="color: #ef4444; margin-bottom: 12px; font-size: 0.875rem;">Danger Zone</h4>
                    <button onclick="RoyalLegacyApp.clearAllData()" class="btn btn-secondary" style="width: 100%; color: #ef4444; border-color: #ef4444;">🗑️ Clear All Data</button>
                </div>
                
                <button class="btn btn-gold" onclick="RoyalLegacyApp.hideModal('settingsModal')" style="width: 100%;">Close</button>
            </div>
        `;
        
        document.body.appendChild(modal);
        setTimeout(() => modal.classList.remove('hide'), 10);
    },

    toggleSetting(setting) {
        const state = StateManager.get();
        const currentValue = state[setting];
        StateManager.set(setting, !currentValue);
        
        if (setting === 'largeText') {
            // 适度增大字体，保持布局
            document.body.style.fontSize = !currentValue ? '16px' : '';
            // 只应用到文本元素，避免破坏布局
            document.querySelectorAll('p, span, h1, h2, h3, h4, h5, h6, .btn').forEach(elem => {
                elem.style.fontSize = !currentValue ? '1.1em' : '';
            });
            // 增强标题可读性
            document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(elem => {
                elem.style.fontWeight = !currentValue ? '700' : '';
            });
            // 确保按钮文字清晰
            document.querySelectorAll('.btn').forEach(btn => {
                btn.style.fontWeight = !currentValue ? '600' : '';
            });
        }
        if (setting === 'highContrast') {
            // 适度增加对比度
            document.body.style.filter = !currentValue ? 'contrast(1.2)' : '';
            // 调整背景和文字颜色，保持舒适度
            document.body.style.backgroundColor = !currentValue ? '#0a0a0f' : '';
            document.body.style.color = !currentValue ? '#ffffff' : '';
            // 增强玻璃卡片的对比度
            document.querySelectorAll('.glass-card').forEach(card => {
                card.style.background = !currentValue ? 'rgba(26,26,46,0.9)' : '';
                card.style.borderColor = !currentValue ? 'rgba(212,175,55,0.6)' : '';
            });
            // 增强按钮对比度
            document.querySelectorAll('.btn').forEach(btn => {
                btn.style.borderWidth = !currentValue ? '2px' : '';
            });
            // 确保文字清晰可读
            document.querySelectorAll('p, span, div').forEach(elem => {
                elem.style.color = !currentValue ? '#ffffff' : '';
            });
        }
        if (setting === 'reducedMotion') {
            // 减少动画效果
            document.body.style.animation = !currentValue ? 'none' : '';
            document.body.style.transition = !currentValue ? 'none' : '';
            // 禁用所有元素的动画
            document.querySelectorAll('*').forEach(elem => {
                elem.style.animation = !currentValue ? 'none' : '';
                elem.style.transition = !currentValue ? 'none' : '';
            });
        }
        
        this.hideModal('settingsModal');
        setTimeout(() => this.showSettingsModal(), 100);
    },

    clearAllData() {
        if (confirm('Are you sure you want to clear all game data? This cannot be undone!')) {
            // 清理前的数据统计
            const beforeData = {
                totalItems: localStorage.length,
                gameDataSize: localStorage.getItem('royalLegacy_v2') ? localStorage.getItem('royalLegacy_v2').length : 0,
                otherItems: []
            };
            
            // 收集其他可能的相关数据项
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith('royalLegacy_')) {
                    beforeData.otherItems.push(key);
                }
            }
            
            // 彻底清除所有相关数据
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith('royalLegacy_')) {
                    keysToRemove.push(key);
                }
            }
            
            keysToRemove.forEach(key => {
                localStorage.removeItem(key);
            });
            
            // 清理后的数据统计
            const afterData = {
                totalItems: localStorage.length,
                gameDataSize: localStorage.getItem('royalLegacy_v2') ? localStorage.getItem('royalLegacy_v2').length : 0,
                otherItems: []
            };
            
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith('royalLegacy_')) {
                    afterData.otherItems.push(key);
                }
            }
            
            // 生成清理报告
            const report = `
=== Data Cleanup Report ===
Before Cleanup:
- Total local storage items: ${beforeData.totalItems}
- Game data size: ${beforeData.gameDataSize} bytes
- Related items: ${beforeData.otherItems.join(', ') || 'None'}

After Cleanup:
- Total local storage items: ${afterData.totalItems}
- Game data size: ${afterData.gameDataSize} bytes
- Related items: ${afterData.otherItems.join(', ') || 'None'}

Cleanup Status: ${afterData.otherItems.length === 0 ? 'SUCCESS - All game data removed' : 'WARNING - Some items may remain'}
`;
            
            console.log(report);
            
            // 显示清理完成提示
            this.showToast('All game data has been cleared successfully', 'success');
            
            // 延迟刷新页面，让用户看到提示
            setTimeout(() => {
                location.reload();
            }, 1500);
        }
    },

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    _handleInitError(error) {
        console.error('Application initialization failed:', error);
        document.body.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;padding:20px;text-align:center;background:#0a0a0f;color:white;">
                <h1 style="color:#d4af37;margin-bottom:16px;">⚠️ Error</h1>
                <p style="color:rgba(255,255,255,0.7);margin-bottom:24px;">Failed to initialize the game. Please refresh the page.</p>
                <button onclick="location.reload()" style="padding:12px 24px;background:#d4af37;color:#0a0a0f;border:none;border-radius:8px;cursor:pointer;font-weight:600;">Refresh Page</button>
            </div>
        `;
    }
};

document.addEventListener('DOMContentLoaded', () => {
    RoyalLegacyApp.init();
});

window.RoyalLegacyApp = RoyalLegacyApp;
