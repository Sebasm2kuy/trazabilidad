// ============================================================
// Google Apps Script - Backend para Trazabilidad
// ============================================================
// INSTRUCCIONES:
// 1. Andá a https://script.google.com/
// 2. Creá un nuevo proyecto
// 3. Pegá TODO este código (reemplazá el contenido por defecto)
// 4. En el menú "Implementar" > "Nueva implementación"
//    - Tipo: "Aplicación web"
//    - Ejecutar como: "Yo"
//    - Quién tiene acceso: "Cualquier persona"
// 5. Copiá la URL que te da y pegala en la app de Trazabilidad
//    (Aparece un ícono de Settings ⚙ al lado del título)
// ============================================================

const SHEET_NAME = 'trazabilidad_data';
const LOCK_TIMEOUT_MS = 10000;

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['key', 'value', 'updated_at']);
    sheet.getRange(1, 1, 1, 3).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getLock_() {
  return LockService.getScriptLock();
}

function doGet(e) {
  try {
    var action = e.parameter.action;

    if (action === 'ping') {
      return jsonResponse_({ status: 'ok', time: new Date().toISOString() });
    }

    if (action === 'get') {
      var key = e.parameter.key;
      if (!key) return jsonResponse_({ error: 'Missing key parameter' }, 400);
      var lock = getLock_();
      try {
        lock.waitLock(LOCK_TIMEOUT_MS);
        var sheet = getSheet_();
        var data = getAllData_(sheet);
        if (data[key] !== undefined) {
          return jsonResponse_({ key: key, value: data[key] });
        }
        return jsonResponse_({ key: key, value: null });
      } finally {
        lock.releaseLock();
      }
    }

    if (action === 'getall') {
      var lock = getLock_();
      try {
        lock.waitLock(LOCK_TIMEOUT_MS);
        var sheet = getSheet_();
        var data = getAllData_(sheet);
        return jsonResponse_({ data: data });
      } finally {
        lock.releaseLock();
      }
    }

    if (action === 'getmulti') {
      var keysStr = e.parameter.keys;
      if (!keysStr) return jsonResponse_({ error: 'Missing keys parameter' }, 400);
      var requestedKeys = keysStr.split(',');
      var lock = getLock_();
      try {
        lock.waitLock(LOCK_TIMEOUT_MS);
        var sheet = getSheet_();
        var data = getAllData_(sheet);
        var result = {};
        for (var i = 0; i < requestedKeys.length; i++) {
          var k = requestedKeys[i];
          if (data[k] !== undefined) result[k] = data[k];
        }
        return jsonResponse_({ data: result });
      } finally {
        lock.releaseLock();
      }
    }

    return jsonResponse_({ error: 'Unknown action. Use: ping, get, getall, getmulti', available: ['ping', 'get', 'getall', 'getmulti'] }, 400);

  } catch (error) {
    return jsonResponse_({ error: error.toString() }, 500);
  }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action;

    if (action === 'set') {
      var key = body.key;
      var value = body.value;
      if (!key || value === undefined) return jsonResponse_({ error: 'Missing key or value' }, 400);
      var lock = getLock_();
      try {
        lock.waitLock(LOCK_TIMEOUT_MS);
        var sheet = getSheet_();
        setKeyValue_(sheet, key, value);
        return jsonResponse_({ status: 'ok', key: key });
      } finally {
        lock.releaseLock();
      }
    }

    if (action === 'setmulti') {
      var data = body.data;
      if (!data || typeof data !== 'object') return jsonResponse_({ error: 'Missing data object' }, 400);
      var lock = getLock_();
      try {
        lock.waitLock(LOCK_TIMEOUT_MS);
        var sheet = getSheet_();
        var keys = Object.keys(data);
        for (var i = 0; i < keys.length; i++) {
          setKeyValue_(sheet, keys[i], data[keys[i]]);
        }
        return jsonResponse_({ status: 'ok', saved: keys.length, keys: keys });
      } finally {
        lock.releaseLock();
      }
    }

    if (action === 'push') {
      var data = body.data;
      if (!data || typeof data !== 'object') return jsonResponse_({ error: 'Missing data object' }, 400);
      var lock = getLock_();
      try {
        lock.waitLock(LOCK_TIMEOUT_MS);
        var sheet = getSheet_();
        var remote = getAllData_(sheet);
        // Merge: local overwrites remote (local wins)
        var merged = Object.assign({}, remote, data);
        var mergedKeys = Object.keys(merged);
        for (var i = 0; i < mergedKeys.length; i++) {
          setKeyValue_(sheet, mergedKeys[i], merged[mergedKeys[i]]);
        }
        return jsonResponse_({ status: 'ok', merged_keys: mergedKeys.length });
      } finally {
        lock.releaseLock();
      }
    }

    if (action === 'delete') {
      var key = body.key;
      if (!key) return jsonResponse_({ error: 'Missing key' }, 400);
      var lock = getLock_();
      try {
        lock.waitLock(LOCK_TIMEOUT_MS);
        var sheet = getSheet_();
        deleteKey_(sheet, key);
        return jsonResponse_({ status: 'ok', deleted: key });
      } finally {
        lock.releaseLock();
      }
    }

    return jsonResponse_({ error: 'Unknown action. Use: set, setmulti, push, delete' }, 400);

  } catch (error) {
    return jsonResponse_({ error: error.toString() }, 500);
  }
}

function getAllData_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return {};
  var data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  var result = {};
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if (row[0] && row[0].toString().trim()) {
      try {
        result[row[0].toString().trim()] = JSON.parse(row[1].toString());
      } catch (e) {
        result[row[0].toString().trim()] = row[1];
      }
    }
  }
  return result;
}

function setKeyValue_(sheet, key, value) {
  var lastRow = sheet.getLastRow();
  var values = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat() : [];
  var existIdx = -1;
  for (var i = 0; i < values.length; i++) {
    if (values[i] && values[i].toString().trim() === key) {
      existIdx = i;
      break;
    }
  }

  var strValue = JSON.stringify(value);
  var now = new Date().toISOString();

  if (existIdx >= 0) {
    var row = existIdx + 2;
    sheet.getRange(row, 2).setValue(strValue);
    sheet.getRange(row, 3).setValue(now);
  } else {
    sheet.appendRow([key, strValue, now]);
  }
}

function deleteKey_(sheet, key) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;
  var values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = values.length - 1; i >= 0; i--) {
    if (values[i][0] && values[i][0].toString().trim() === key) {
      sheet.deleteRow(i + 2);
      return;
    }
  }
}

function jsonResponse_(data, statusCode) {
  statusCode = statusCode || 200;
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}