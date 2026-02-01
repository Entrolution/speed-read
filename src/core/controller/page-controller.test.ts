import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PageController } from './page-controller';

describe('PageController', () => {
  let controller: PageController;
  let container: HTMLElement;
  let onPageChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    controller = new PageController();
    container = document.createElement('div');
    onPageChange = vi.fn();
  });

  afterEach(() => {
    controller.destroy();
  });

  describe('initialization', () => {
    it('should initialize with default values', () => {
      expect(controller.currentPage).toBe(1);
      expect(controller.totalPages).toBe(1);
    });

    it('should set total pages on init', () => {
      controller.init(container, { totalPages: 10 });
      expect(controller.totalPages).toBe(10);
    });

    it('should make container focusable', () => {
      controller.init(container, { totalPages: 10 });
      expect(container.getAttribute('tabindex')).toBe('0');
    });
  });

  describe('navigation', () => {
    beforeEach(() => {
      controller.init(container, { totalPages: 10, onPageChange });
    });

    it('should navigate to next page', async () => {
      await controller.next();
      expect(controller.currentPage).toBe(2);
      expect(onPageChange).toHaveBeenCalledWith(2, 10);
    });

    it('should navigate to previous page', async () => {
      await controller.goTo(5);
      await controller.prev();
      expect(controller.currentPage).toBe(4);
    });

    it('should not go before first page', async () => {
      await controller.prev();
      expect(controller.currentPage).toBe(1);
    });

    it('should not go past last page', async () => {
      await controller.goTo(10);
      await controller.next();
      expect(controller.currentPage).toBe(10);
    });

    it('should go to specific page', async () => {
      await controller.goTo(5);
      expect(controller.currentPage).toBe(5);
    });

    it('should clamp page number to valid range', async () => {
      await controller.goTo(100);
      expect(controller.currentPage).toBe(10);

      await controller.goTo(-5);
      expect(controller.currentPage).toBe(1);
    });
  });

  describe('setTotalPages', () => {
    it('should update total pages', () => {
      controller.init(container, { totalPages: 10 });
      controller.setTotalPages(20);
      expect(controller.totalPages).toBe(20);
    });
  });

  describe('keyboard navigation', () => {
    beforeEach(() => {
      controller.init(container, { totalPages: 10, onPageChange });
    });

    it('should navigate with arrow keys', () => {
      const event = new KeyboardEvent('keydown', { key: 'ArrowRight' });
      document.dispatchEvent(event);
      expect(controller.currentPage).toBe(2);
    });

    it('should navigate with space', () => {
      const event = new KeyboardEvent('keydown', { key: ' ' });
      document.dispatchEvent(event);
      expect(controller.currentPage).toBe(2);
    });

    it('should go to first page with Home', async () => {
      await controller.goTo(5);
      const event = new KeyboardEvent('keydown', { key: 'Home' });
      document.dispatchEvent(event);
      expect(controller.currentPage).toBe(1);
    });

    it('should go to last page with End', () => {
      const event = new KeyboardEvent('keydown', { key: 'End' });
      document.dispatchEvent(event);
      expect(controller.currentPage).toBe(10);
    });
  });
});
