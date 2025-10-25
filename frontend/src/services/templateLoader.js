import { TEMPLATE_LIBRARY } from '../data/templates';
import { createRoom } from '../api/rooms';
import { getAuthToken } from '../utils/authUtils';

export class TemplateLoader {
  static async loadTemplate(templateId, canvas) {
    const template = TEMPLATE_LIBRARY.find(t => t.id === templateId);
    if (!template) throw new Error('Template not found');

    // Clear canvas if API is provided
    if (canvas && typeof canvas.clear === 'function') canvas.clear();

    if (canvas && typeof canvas.setSize === 'function' && template.canvas) {
      canvas.setSize(template.canvas.width, template.canvas.height);
      if (typeof canvas.setBackground === 'function') canvas.setBackground(template.canvas.background);
    }

    // Add provided objects if canvas API supports addObject
    if (canvas && template.canvas && Array.isArray(template.canvas.objects)) {
      for (const obj of template.canvas.objects) {
        if (typeof canvas.addObject === 'function') {
          try { await canvas.addObject(obj); } catch (e) { /* best-effort */ }
        }
      }
    }

    if (canvas && typeof canvas.zoomToFit === 'function') canvas.zoomToFit();
    return template;
  }

  // Create a new room based on template (MVP: creates room and returns its id)
  static async createFromTemplate(templateId, token) {
    const template = TEMPLATE_LIBRARY.find(t => t.id === templateId);
    if (!template) throw new Error('Template not found');

    const name = `${template.name} - ${new Date().toLocaleDateString()}`;
    // Use existing createRoom API to create a room. Additional fields may be ignored by server.
    const tkn = token || getAuthToken();
    const room = await createRoom(tkn, { name, type: 'private' });
    return room;
  }
}

export default TemplateLoader;
