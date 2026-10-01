/** 测试模式只在开发环境或显式设置 VITE_TEST_MODE=1 的构建中出现。 */
export const testModeEnabled = import.meta.env.DEV || import.meta.env.VITE_TEST_MODE === "1";
