/**
 * Note the .js file extension for highlighting, this is a .gs file
 */

// test data persistence
var properties = PropertiesService.getScriptProperties();
var data = getData() || {};
var errorRows = 'errorRows' in data ? data.errorRows : []; // B4:E4
var errorCell = {}; // row, col
var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
var letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// this is the weight column in my case, the last cell before doing an API call
var triggerCell = {
  row: 4.0,
  col: 5.0
};

function saveData(data) {
  properties.setProperty('data', JSON.stringify(data));
}

function getData() {
  var data = properties.getProperty('data');
  if (data) {
    return JSON.parse(data);
  }
  return data;
}

function atEdit(e) {
  if (!('value' in e)) {
    return false; // maybe border change
  }
  
  var curCell = {
    range: e.range,
    row: e.range.getRow(),
    col: e.range.getColumn()
  }
  
  var rowRange = getRowRange(curCell.row, curCell.col);
  var errorTrig = false;
  
  if (errorRows.indexOf(curCell.row) !== -1) {
    errorTrig = true;
    errorCell = curCell;
    setNoBorder(errorCell);
    curCell.col = triggerCell.col;
    rowRange = getRowRange(curCell.row, triggerCell.col);
  }
  
  var dimensionsCellEdited = false;
  if (curCell.col === 4) {
    dimensionsCellEdited = true;
  }
  
  var shipmentRange = `${getColLetter(curCell.col + 1)}${curCell.row}`;
  var shipmentCell = sheet.getRange(shipmentRange);
  
  if (!dimensionsCellEdited && (errorTrig || curCell.col === triggerCell.col && curCell.row >= triggerCell.row)) {
    var rowVals = getRowVals(curCell.row, curCell.col);
    var errKey;
    
    if (Object.keys(rowVals).some((key) => {
      if (key !== 'dimensions' && !rowVals[key]) {
        errKey = key;
        return true;
      }
      return false;
    })) {
      if (errKey === 'apiKey') {
        shipmentCell.setValue('invalid api key');
        setErrorBorder(shipmentRange);
        return false;
      } else {
        notifyError(rowRange, errKey);
      }
    } else {
      var apiBaseUrl = 'https://your-domain.com/endpoint/';
      var queryStr = '';
      
      // paremeterize rowVals for GET query
      Object.keys(rowVals).forEach((key, index) => {
        if (index !== 0) {
          queryStr += `&${key}=${rowVals[key]}`;
        } else {
          queryStr = `?${key}=${rowVals[key]}`;
        }
      });
              
      var res = UrlFetchApp.fetch(apiBaseUrl + queryStr);
      var resJson = JSON.parse(res.getContentText());
      
      if (resJson.success && Number.isInteger(parseInt(resJson.rate))) {
        shipmentCell.setValue('$' + resJson.rate);
        setNoBorder(shipmentRange); // in case previously in error state
      } else {
        setErrorBorder(shipmentRange);                    
      }
    }
  }
}

function setNoBorder(cellObj) {
  var cell;
  if (typeof cellObj !== 'object') {
    cell = sheet.getRange(cellObj);
  } else {
    cell = sheet.getRange(`${getColLetter(cellObj.col)}${cellObj.row}`);
  }
  cell.setBorder(false, false, false, false, false, false);
  if (!data.errorRows) {
    data.errorRows = []; 
  } else {
    if (typeof cellObj !== 'object') {
      data.errorRows.splice(cellObj.split('')[1], 1);
    } else {
      data.errorRows.splice(cellObj.col, 1);
    }
  }
  saveData(data);
}

// rowRange is left to right
function getRowCellFromRange(rowRange, colName) {
  var rowNum = rowRange.split(':')[0].split('')[1];
  var colLetter = rowRange.split(':')[0].split('')[0];
  var colNum = getNumberFromLetter(colLetter);
  if (colName === 'zipFrom') {
    return rowRange.split(':')[0];
  } else if (colName === 'zipTo') {
    return `${getColLetter(colNum + 1)}${rowNum}`;
  } else if (colName === 'dimensions') {
    return `${getColLetter(colNum + 2)}${rowNum}`;
  } else {
    return `${getColLetter(colNum + 3)}${rowNum}`;
  }
}

function setErrorBorder(errorRange) { // should be 1 cell
  var cell = sheet.getRange(errorRange);
  // Sets borders on the top and bottom, but leaves the left and right unchanged
  // Also sets the color to "red", and the border to "DASHED".
  cell.setBorder(true, true, true, true, false, false, "red", SpreadsheetApp.BorderStyle.SOLID);
}

function notifyError(rowRange, colName) {
  var row = rowRange.split(':')[0].split('')[1];
  if (errorRows.indexOf(row === -1)) {
    errorRows.push(parseInt(row));
    data.errorRows = errorRows;
    saveData(data);
  }
  setErrorBorder(getRowCellFromRange(rowRange, colName));
  SpreadsheetApp.getUi().alert('Please correct the cell outlined in red');
}

function getNumberFromLetter(letter) {
 return letters.indexOf(letter) + 1; 
}

function getColLetter(col) {
  if (col < 27) {
    return letters[col - 1];
  }
  else {
    return false;
  }
}
      
function getRowRange(activeRow, activeCol) {
  if (activeCol !== triggerCell.col) {
    return `${getColLetter([activeCol])}${activeRow}:${getColLetter([activeCol])}${activeRow}`;
  }
  
  return `${getColLetter([activeCol - 3])}${activeRow}:${getColLetter([activeCol])}${activeRow}`;
}

// returns 1x5 array
function getRowVals(activeRow, activeCol) {
  var rangeStr = getRowRange(activeRow, activeCol);
  var range = sheet.getRange(rangeStr);
  var rowValues = range.getValues();

  return {
    zipFrom: validateZip(rowValues[0][0]),
    zipTo: validateZip(rowValues[0][1]),
    dimensions: validateDimensions(rowValues[0][2]),
    weight: validateWeight(rowValues[0][3]),
    range: rangeStr,
    apiKey: 'api-key-matches-your-api'
  };
}

// only care if not empty
function validateZip(zip) {
  if (!zip) {
    return false;  
  }
  
  if (zip.length === 0) {
    return false; 
  }
  
  if (!Number.isInteger(zip)) {
    var blockedZipWords = []; // for custom interal verbage eg. "not supported"
    
    if (blockedZipWords.indexOf(zip.toLowerCase()) !== -1) {
      return false;
    }
  }
  
  return zip; // can't get rid of added float, do it server side
}

// matches LxWxH
function validateDimensions(dimensions) {
  if (!dimensions) {
    return ''; // php doesn't like false, also on sheet blank checking is ignored for dimensions
  }
  
  if (dimensions.length === 0 || dimensions.length < 5) {
    return '';
  }
  
  if (Number.isInteger(dimensions) || dimensions.indexOf('x') === -1) {
    return '';
  }
  
  if ((dimensions.match(/x/g) || []).length !== 2) {
    return '';
  }
  
  // basic pattern check
  var stripX = dimensions.replace('/x/g', '');
  if (stripX.indexOf('.') !== -1) {
  	stripX = parseFloat(stripX);
  } else {
  	stripX = parseInt(stripX);
  }

  if (!Number.isInteger(stripX)) {
 		return '';
  }
  
  // no exact pattern match
  
  return dimensions;
}

function validateWeight(weight) {
  if (!weight) {
    return false;
  }  
    
  if (weight.length === 0) {
    return false;
  }
  
  if (!Number.isInteger(weight)) {
    return false;
  }
  
  return weight;
}