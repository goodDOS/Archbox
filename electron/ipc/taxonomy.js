'use strict';
/**
 * 层级模型通道：大区 / 分类 / 标签 / 自定义字段 的列表与增删。
 */
const db = require('../db');
const { S, I, handle, currentUser } = require('./shared');

function registerTaxonomy() {
  handle('region:list', async () => db.listRegions());
  handle('region:save', async p => {
    db.saveRegion({ id: I(p.id), name: S(p.name), code: S(p.code), color: S(p.color), sort: p.sort }, currentUser());
    return db.listRegions();
  });
  handle('region:delete', async p => {
    db.deleteRegion(I(p.id), currentUser());
    return db.listRegions();
  });
  handle('cat:list', async p => db.listCategories(p.regionId ? I(p.regionId) : undefined));
  handle('cat:save', async p => {
    db.saveCategory(
      { id: I(p.id), region_id: I(p.regionId), name: S(p.name), code: S(p.code), sort: p.sort },
      currentUser()
    );
    return true;
  });
  handle('cat:delete', async p => {
    db.deleteCategory(I(p.id), currentUser());
    return true;
  });
  handle('tag:list', async () => db.listTags());
  handle('tag:save', async p => {
    db.saveTag({ id: I(p.id), name: S(p.name) }, currentUser());
    return db.listTags();
  });
  handle('tag:delete', async p => {
    db.deleteTag(I(p.id), currentUser());
    return db.listTags();
  });
  handle('field:list', async () => db.listFieldDefs());
  handle('field:save', async p => {
    db.saveFieldDef(
      {
        id: I(p.id),
        name: S(p.name),
        code: S(p.code),
        type: S(p.type),
        options: S(p.options),
        required: !!p.required,
        unique_field: !!p.uniqueField,
        sort: p.sort
      },
      currentUser()
    );
    return db.listFieldDefs();
  });
  handle('field:delete', async p => {
    db.deleteFieldDef(I(p.id), currentUser());
    return db.listFieldDefs();
  });
}

module.exports = { registerTaxonomy };
