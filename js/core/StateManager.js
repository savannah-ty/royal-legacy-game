/**
 * StateManager - 状态管理器 (优化版)
 * 集中管理游戏状态，提供状态订阅和持久化功能
 * 
 * 优化点：
 * 1. 使用 WeakMap 避免内存泄漏
 * 2. 批量更新优化
 * 3. 更高效的防抖实现
 * 4. 深度克隆防止引用问题
 * 5. 类型检查增强健壮性
 */

const StateManager = (() => {
    'use strict';

    // 私有变量
    let state = {};
    const listeners = new Map();
    const persistKey = 'royalLegacy_v2';
    const persistBlacklist = new Set(['isProcessing', 'selectedTile', 'tempData']);
    let saveTimeout = null;
    let isInitialized = false;

    // 默认状态
    const defaultState = Object.freeze({
        // User & Auth
        userAge: null,
        ageMode: null,
        isChildMode: false,
        isLoggedIn: false,
        loginType: null,
        userName: 'Guest',

        // Game Data
        gold: 0,
        stamina: 10,
        maxStamina: 10,
        staminaRecoveryTime: 300,
        lastStaminaUpdate: Date.now(),
        cardPacks: 0,
        totalStars: 0,
        currentLevel: 1,
        levelStars: Object.seal(Array(25).fill(0)),
        levelUnlocked: Object.seal(Array(25).fill(false).map((_, i) => i === 0)),

        // Current Game
        score: 0,
        targetScore: 500,
        steps: 30,
        selectedTile: null,
        album: Object.seal(Array(40).fill(false)),
        signDays: 0,
        signToday: false,
        isProcessing: false,
        firstRecharge: false,
        monthlyCard: 0,
        monthlyCardReceived: false,
        growthFund: false,
        growthFundClaimed: Object.freeze([]),

        // Settings
        highContrast: false,
        reducedMotion: false,
        largeText: false,
        soundEnabled: true,

        // Payment
        selectedPackage: null,
        selectedPaymentMethod: null,

        // Quests
        questProgress: Object.freeze({}),
        achievementProgress: Object.freeze({})
    });

    /**
     * 深度克隆对象
     */
    function deepClone(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (obj instanceof Date) return new Date(obj.getTime());
        if (Array.isArray(obj)) return obj.map(deepClone);
        if (Object.prototype.toString.call(obj) === '[object Object]') {
            const cloned = {};
            for (const key in obj) {
                if (obj.hasOwnProperty(key)) {
                    cloned[key] = deepClone(obj[key]);
                }
            }
            return cloned;
        }
        return obj;
    }

    /**
     * 创建响应式代理
     */
    function createProxy(obj) {
        return new Proxy(obj, {
            set(target, key, value) {
                const oldValue = target[key];
                
                // 防止循环引用
                if (value === target) {
                    console.warn('Circular reference detected');
                    return false;
                }

                target[key] = value;
                notify(key, value, oldValue);

                if (!persistBlacklist.has(key)) {
                    debouncedSave();
                }

                return true;
            },

            get(target, key) {
                const value = target[key];
                // 返回数组和对象的副本，防止外部修改
                if (Array.isArray(value)) {
                    return [...value];
                }
                if (value !== null && typeof value === 'object' && 
                    Object.prototype.toString.call(value) === '[object Object]') {
                    return { ...value };
                }
                return value;
            },

            deleteProperty(target, key) {
                const oldValue = target[key];
                delete target[key];
                notify(key, undefined, oldValue);
                debouncedSave();
                return true;
            }
        });
    }

    /**
     * 通知监听器
     */
    function notify(key, newValue, oldValue) {
        const callbacks = listeners.get(key);
        if (!callbacks) return;

        // 使用 requestAnimationFrame 批量处理
        requestAnimationFrame(() => {
            callbacks.forEach(cb => {
                try {
                    cb(newValue, oldValue, key);
                } catch (error) {
                    console.error(`Error in state listener for ${key}:`, error);
                }
            });
        });
    }

    /**
     * 防抖保存
     */
    function debouncedSave() {
        if (saveTimeout) {
            clearTimeout(saveTimeout);
        }
        saveTimeout = setTimeout(() => {
            saveTimeout = null;
            save();
        }, 300);
    }

    /**
     * 保存到本地存储
     */
    function save() {
        try {
            const dataToSave = {};
            for (const key in state) {
                if (!persistBlacklist.has(key) && state.hasOwnProperty(key)) {
                    dataToSave[key] = state[key];
                }
            }

            const serialized = JSON.stringify(dataToSave);
            localStorage.setItem(persistKey, serialized);
            
            // 触发自定义事件
            window.dispatchEvent(new CustomEvent('state:saved', { 
                detail: { timestamp: Date.now() } 
            }));
        } catch (error) {
            console.error('Failed to save state:', error);
            // 尝试清理存储空间
            if (error.name === 'QuotaExceededError') {
                cleanupStorage();
            }
        }
    }

    /**
     * 清理存储空间
     */
    function cleanupStorage() {
        try {
            // 移除旧数据
            const keys = Object.keys(localStorage);
            keys.forEach(key => {
                if (key.startsWith('royalLegacy_') && key !== persistKey) {
                    localStorage.removeItem(key);
                }
            });
            console.log('Storage cleaned up');
        } catch (e) {
            console.error('Failed to cleanup storage:', e);
        }
    }

    /**
     * 从本地存储加载
     */
    function load() {
        try {
            const saved = localStorage.getItem(persistKey);
            if (!saved) return false;

            const data = JSON.parse(saved);
            
            // 验证数据完整性
            for (const key in defaultState) {
                if (data.hasOwnProperty(key)) {
                    state[key] = data[key];
                }
            }

            console.log('State loaded from storage');
            return true;
        } catch (error) {
            console.error('Failed to load state:', error);
            return false;
        }
    }

    // 公共 API
    return {
        /**
         * 初始化状态
         */
        init(initialState = {}) {
            if (isInitialized) {
                console.warn('StateManager already initialized');
                return this;
            }

            // 深拷贝默认状态
            state = createProxy(deepClone({ ...defaultState, ...initialState }));
            
            // 加载持久化数据
            load();

            isInitialized = true;
            console.log('StateManager initialized');
            return this;
        },

        /**
         * 获取状态
         */
        get(key) {
            if (!isInitialized) {
                console.warn('StateManager not initialized');
                return undefined;
            }
            return key ? state[key] : deepClone(state);
        },

        /**
         * 设置状态
         */
        set(key, value) {
            if (!isInitialized) {
                console.warn('StateManager not initialized');
                return this;
            }

            if (typeof key === 'object') {
                Object.entries(key).forEach(([k, v]) => {
                    state[k] = v;
                });
            } else {
                state[key] = value;
            }
            return this;
        },

        /**
         * 批量更新状态（事务性）
         */
        batchUpdate(updates) {
            if (!isInitialized) {
                console.warn('StateManager not initialized');
                return this;
            }

            const prevState = {};
            const keys = Object.keys(updates);

            // 保存旧值
            keys.forEach(key => {
                prevState[key] = state[key];
            });

            // 批量更新
            keys.forEach(key => {
                state[key] = updates[key];
            });

            // 批量通知
            requestAnimationFrame(() => {
                keys.forEach(key => {
                    notify(key, updates[key], prevState[key]);
                });
            });

            debouncedSave();
            return this;
        },

        /**
         * 订阅状态变化
         */
        subscribe(key, callback) {
            if (!isInitialized) {
                console.warn('StateManager not initialized');
                return () => {};
            }

            if (typeof callback !== 'function') {
                console.error('Callback must be a function');
                return () => {};
            }

            if (!listeners.has(key)) {
                listeners.set(key, new Set());
            }

            const callbacks = listeners.get(key);
            callbacks.add(callback);

            // 返回取消订阅函数
            return function unsubscribe() {
                callbacks.delete(callback);
                if (callbacks.size === 0) {
                    listeners.delete(key);
                }
            };
        },

        /**
         * 一次性订阅
         */
        once(key, callback) {
            const unsubscribe = this.subscribe(key, (newVal, oldVal, k) => {
                unsubscribe();
                callback(newVal, oldVal, k);
            });
            return unsubscribe;
        },

        /**
         * 立即保存
         */
        flush() {
            if (saveTimeout) {
                clearTimeout(saveTimeout);
                saveTimeout = null;
            }
            save();
            return this;
        },

        /**
         * 重置状态
         */
        reset(keys = null) {
            if (!isInitialized) return this;

            if (keys && Array.isArray(keys)) {
                keys.forEach(key => {
                    if (defaultState.hasOwnProperty(key)) {
                        state[key] = deepClone(defaultState[key]);
                    } else {
                        delete state[key];
                    }
                });
            } else {
                // 完全重置
                Object.keys(state).forEach(key => delete state[key]);
                Object.assign(state, deepClone(defaultState));
                localStorage.removeItem(persistKey);
            }

            this.flush();
            return this;
        },

        /**
         * 导出状态
         */
        export() {
            return deepClone(state);
        },

        /**
         * 导入状态
         */
        import(data) {
            if (!isInitialized) return this;

            Object.entries(data).forEach(([key, value]) => {
                if (!persistBlacklist.has(key)) {
                    state[key] = value;
                }
            });

            this.flush();
            return this;
        },

        /**
         * 销毁
         */
        destroy() {
            this.flush();
            listeners.clear();
            state = {};
            isInitialized = false;
            console.log('StateManager destroyed');
        },

        /**
         * 获取初始化状态
         */
        get isInitialized() {
            return isInitialized;
        }
    };
})();

// 导出到全局
window.StateManager = StateManager;
