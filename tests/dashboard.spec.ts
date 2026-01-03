import { test, expect } from '@playwright/test';

// Verifies the Load More functionality on the dashboard.
// Scenario:
// 1) Open dashboard at http://localhost:4567/
// 2) Initial items count should be 5
// 3) Click '더보기' to load 5 more items (total 10)
// 4) Click again to load another 5 items (total 15)

test.describe('Dashboard Load More', () => {
  test('loads 5 -> 10 -> 15 items using Load More', async ({ page }) => {
    // 1. Open dashboard
    await page.goto('http://localhost:4567/');

    // 2. Initial item count should be 5
    const cards = page.locator('#memory-list > div.bg-white');
    await expect(cards).toHaveCount(5);

    // 3. Click "더보기" to load next 5 items (to 10)
    const loadMoreBtn = page.locator('#load-more-btn');
    await loadMoreBtn.click();
    await expect(cards).toHaveCount(10);

    // 4. Click again to load another 5 items (to 15)
    await loadMoreBtn.click();
    await expect(cards).toHaveCount(15);
  });
});
