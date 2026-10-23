#target photoshop
(function () {
    var root = new File($.fileName).parent;
    var output = new Folder(root.fsName + '/png');
    output.create();
    var previousDialogs = app.displayDialogs;
    var previousUnits = app.preferences.rulerUnits;
    var report = { application: 'Adobe Photoshop', version: app.version, status: 'processing', panels: [] };
    var input = null, master = null, panel = null;
    function stringify(value) {
        if (value === null) return 'null';
        if (typeof value === 'string') return '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r/g, '\\r').replace(/\n/g, '\\n') + '"';
        if (typeof value === 'number' || typeof value === 'boolean') return String(value);
        var entries = [], key;
        if (value instanceof Array) {
            for (var i = 0; i < value.length; i++) entries.push(stringify(value[i]));
            return '[' + entries.join(',') + ']';
        }
        for (key in value) if (value.hasOwnProperty(key)) entries.push(stringify(key) + ':' + stringify(value[key]));
        return '{' + entries.join(',') + '}';
    }
    function writeReport() {
        var f = new File(root.fsName + '/photoshop-report.json');
        f.encoding = 'UTF8'; f.open('w'); f.write(stringify(report)); f.close();
    }
    function selectExterior(doc) {
        var desc = new ActionDescriptor(), ref = new ActionReference(), point = new ActionDescriptor();
        ref.putProperty(charIDToTypeID('Chnl'), charIDToTypeID('fsel'));
        desc.putReference(charIDToTypeID('null'), ref);
        point.putUnitDouble(charIDToTypeID('Hrzn'), charIDToTypeID('#Pxl'), 5);
        point.putUnitDouble(charIDToTypeID('Vrtc'), charIDToTypeID('#Pxl'), 5);
        desc.putObject(charIDToTypeID('T   '), charIDToTypeID('Pnt '), point);
        desc.putInteger(charIDToTypeID('Tlrn'), 24);
        desc.putBoolean(charIDToTypeID('AntA'), true);
        desc.putBoolean(charIDToTypeID('Cntg'), true);
        desc.putBoolean(charIDToTypeID('Mrgd'), false);
        executeAction(charIDToTypeID('setd'), desc, DialogModes.NO);
    }
    try {
        app.displayDialogs = DialogModes.NO;
        app.preferences.rulerUnits = Units.PIXELS;
        input = app.open(new File(root.fsName + '/owner-provided-sheet.webp'));
        if (input.width.as('px') !== 3276 || input.height.as('px') !== 2184) throw new Error('Unexpected source dimensions');
        master = input.duplicate('Arturia six reactions - transparent source');
        master.activeLayer.isBackgroundLayer = false;
        master.activeLayer.name = 'Original owner supplied sheet - reference';
        master.activeLayer.visible = false;
        var names = ['puzzled', 'hesitant', 'shy', 'unimpressed', 'smug', 'teasing'];
        for (var i = 0; i < 6; i++) {
            app.activeDocument = input;
            panel = input.duplicate('arturia-react-' + ('0' + (i + 1)).slice(-2));
            var x = (i % 3) * 1092, y = Math.floor(i / 3) * 1092;
            panel.crop([UnitValue(x, 'px'), UnitValue(y, 'px'), UnitValue(x + 1092, 'px'), UnitValue(y + 1092, 'px')]);
            panel.activeLayer.isBackgroundLayer = false;
            panel.activeLayer.name = 'arturia-react-' + ('0' + (i + 1)).slice(-2) + ' - ' + names[i];
            selectExterior(panel);
            panel.selection.clear();
            panel.selection.deselect();
            executeAction(stringIDToTypeID('removeWhiteMatte'), undefined, DialogModes.NO);
            var nativeBounds = panel.activeLayer.bounds;
            var desiredX = x + nativeBounds[0].as('px'), desiredY = y + nativeBounds[1].as('px');
            var duplicated = panel.activeLayer.duplicate(master, ElementPlacement.PLACEATBEGINNING);
            app.activeDocument = master;
            var copiedBounds = duplicated.bounds;
            duplicated.translate(UnitValue(desiredX - copiedBounds[0].as('px'), 'px'), UnitValue(desiredY - copiedBounds[1].as('px'), 'px'));
            app.activeDocument = panel;
            panel.trim(TrimType.TRANSPARENT, true, true, true, true);
            var w = panel.width.as('px'), h = panel.height.as('px'), factor = 480 / Math.max(w, h);
            panel.resizeImage(UnitValue(Math.round(w * factor), 'px'), UnitValue(Math.round(h * factor), 'px'), null, ResampleMethod.BICUBICSHARPER);
            panel.resizeCanvas(UnitValue(512, 'px'), UnitValue(512, 'px'), AnchorPosition.MIDDLECENTER);
            var filename = 'arturia-react-' + ('0' + (i + 1)).slice(-2) + '.png';
            var pngOptions = new PNGSaveOptions(); pngOptions.interlaced = false; pngOptions.compression = 6;
            panel.saveAs(new File(output.fsName + '/' + filename), pngOptions, true, Extension.LOWERCASE);
            report.panels.push({ id: filename.replace('.png', ''), file: filename, emotion_key: names[i], source_crop: [x, y, x + 1092, y + 1092], native_content_size: [w, h], output_size: [512, 512], background_selection: 'contiguous magic wand at 5,5; tolerance 24; anti-alias; white matte removed', signature: 'preserved' });
            panel.close(SaveOptions.DONOTSAVECHANGES); panel = null;
        }
        input.close(SaveOptions.DONOTSAVECHANGES); input = null;
        app.activeDocument = master;
        var psd = new PhotoshopSaveOptions(); psd.layers = true; psd.embedColorProfile = true;
        var psdFile = new File(root.fsName + '/arturia-six-reactions.psd');
        master.saveAs(psdFile, psd, false, Extension.LOWERCASE);
        report.psd = psdFile.fsName;
        report.status = 'complete';
    } catch (error) {
        report.status = 'failed'; report.error = error.toString(); report.line = error.line;
    } finally {
        app.displayDialogs = previousDialogs;
        app.preferences.rulerUnits = previousUnits;
        writeReport();
    }
}());
