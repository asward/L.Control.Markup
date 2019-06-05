import redline_marker from "../img/redline_marker.svg";

L.Control.Markup = L.Control.extend(/** @lends L.Control.Markup.prototype */ {
    includes: (L.Evented.prototype || L.Mixin.Events),

    options: {
        id: 'markup',
        markup_select_callback: (markup_id) => { console.log(`Markup ID ${markup_id}`);},
    },

    initialize: function (options) {
        L.setOptions(this, options);
        this.markup_layer_groups = [];
        this.CurrentMarkup = null;
        this.canvas = null;
        this.current_layer = 1;
        this.OnMarkupSelected = [];
    },
    register_onMarkupSelected: function (callback) {
        this.OnMarkupSelected.push(callback);
    },
    addTo: function (map) {
        this._map = map;
        return this;
    },

    remove: function (map) {
        this._map = null;
        return this;
    },

    get_layer_group: function (layer_num) {

        if (!this.markup_layer_groups[layer_num]) {
            this.markup_layer_groups[layer_num] = L.layerGroup();
        }
        return this.markup_layer_groups[layer_num];
    },

    show_layer: function (layer_num, { hide_layers = true } = {}) {
        this.current_layer = layer_num;
        if (hide_layers) {
            this.hide_layer();
        }
        var layer = this.get_layer_group(layer_num);
        layer.addTo(this._map);
    },

    hide_layer: function (layer_num) {
        this.markup_layer_groups.forEach((layer) => {
            this._map.removeLayer(layer);
        });
    },

    add_markup: function (_markup, type = 'svg') {

        var markup = Object.assign({
            bounds: [[0, 0], [0, 0]],
            image: '',
            marker_text: '',
            marker_latlng: [0,0],
            layer: 0
        }, _markup);

        let layer = this.get_layer_group(markup.layer);
        let ol;
        switch (type) {
            case 'image':
                ol = L.imageOverlay('data:image/svg+xml;charset=utf-8,' + markup.image, markup.bounds);
                layer.addLayer(ol);
                break;
            case 'svg':
                //make SVG element
                var obj = document.createElement('object');
                obj.innerHTML = markup.image;
                var svg = obj.querySelector('svg');
                svg.setAttribute("viewBox", `0, 0, ${svg.width.baseVal.value},${svg.height.baseVal.value}`); 
                svg.style.cursor = 'move';

                ol = L.imageElementOverlay(svg, markup.bounds, { interactive: false });

                layer.addLayer(ol);
                break;
        }
        var iconSVG = 'data:image/svg+xml;base64,' + btoa(redline_marker);
        
        var icon = new L.DivIcon({
            iconAnchor: [0, 50],
            iconSize: [200, 50],
            className: 'my-div-icon',
            html: `<div class="d-flex flex-row">
                        <img class="my-div-image" src="${iconSVG}"/>
                        <span class="d-flex align-items-center w-100">${markup.marker_text}</span>
                    </div>`
        })

        var marker = L.marker(markup.marker_latlng, { icon: icon }).addTo(layer);
        
        marker.on('click', (e) => {
            this.markup_select_event(e, markup.id);
        });
    },

    markup_select_event: function (e, markup_id) {
        this.OnMarkupSelected.forEach((cb) => { cb(markup_id);})
    },

    start: function(){
        this.lock_map();
        this.CurrentMarkup = new Markup(this.get_canvas());
    },

    stop: function () {
        this.unlock_map();
        this.clear();
    },

    freeze: function () {
        if (null !== this.CurrentMarkup) {
            this.CurrentMarkup.SetMode('off');
        }
    },

    clear: function () {
        if (null !== this.CurrentMarkup) {
            this.CurrentMarkup.Destroy();
            this.remove_canvas();
        }
        this.CurrentMarkup = null;
    },

    store: function () {
        if (null !== this.CurrentMarkup) {
            var markup = {
                marker_latlng: [this.first_point().lat, this.first_point().lng],
                bounds: this.bounds(),
                image: this.CurrentMarkup.SVG,
                layer: this.current_layer
            };
            this.add_markup(markup);
        }
    },

    clear_all: function () {
        this.clear();
        this.markup_layer_groups.forEach((l) => { this._map.removeLayer(l) });
        this.markup_layer_groups = [];
    },

    remove_canvas: function () {
        if (null !== this.canvas) {
            this.canvas.remove();
        }
        this.canvas = null;
    },

    get_canvas: function () {
        if (null === this.canvas) {
            this.canvas = document.createElement("canvas");
            this.canvas.className = 'canvases';
            this.canvas.id = 'markup-canvas';
            var canvasDiv = this._map._container; //looking for #map div
            //var canvasDiv = this._map.getPane('overlayPane');
            this.canvas.style.width = '100%';
            this.canvas.style.height = '100%';
            canvasDiv.prepend(this.canvas);

            // ...then set the internal size to match
            //this.canvas.width = this.canvas.offsetWidth;
            //this.canvas.height = this.canvas.offsetHeight;
            this.canvas.width = this.canvas.clientWidth;
            this.canvas.height = this.canvas.clientHeight;

        }
        return this.canvas;
    },

    lock_map: function(){

        this._map._handlers.forEach(function (handler) {
            handler.disable();
        });
    },

    unlock_map: function () {
        this._map._handlers.forEach(function (handler) {
            handler.enable();
        });
    },

    bounds: function () {
        return this._map.getBounds();
    },

    type: function() {
        return 'redline';
    },
    get_svg: function () {
        return this.CurrentMarkup.SVG;
    },
    first_point: function () {
        return this._map.layerPointToLatLng([this.CurrentMarkup.FirstPoint.x, this.CurrentMarkup.FirstPoint.y]);
    },
    marker_point: function () {
        return this._map.layerPointToLatLng([this.CurrentMarkup.MarkerPoint.x, this.CurrentMarkup.MarkerPoint.y]);
    }
});

L.control.markup = function (options) {
    return new L.Control.Markup(options);
};


class Markup {
    //Class to capture and control all markup types (stroke, text, shapes, etc.)
    //Controls the canvas?
    //exports SVG?
    //stores markup state.
    constructor(canvas, _opt = {}) {
        if (!(this instanceof Markup)) return new Markup(_canvas);

        this.canvas = canvas;

        this.opts = Object.assign({
            init_mode: 'stroke',
        }, _opt);


        this.context = this.canvas.getContext("2d");

        //this.context.canvas.width = this.context.canvas.clientWidth;
        //this.context.canvas.height = this.context.canvas.clientHeight;

        var viewportOffset = this.canvas.getBoundingClientRect();

        // these are relative to the viewport, i.e. the window
        this.x_offset = viewportOffset.left;
        this.y_offset = viewportOffset.top;

        this.modes = {
            none: 'none',
            stroke: 'stroke',
            line: 'line',
            rectangle: 'rectangle',
            circle: 'circle',
            text: 'text',
            x: 'x',
        };
        this.mode = this.opts.init_mode;


        this.History = [];
        this.undoLevel = 0;
        this._currentData = null;

        this.TouchMouseHandler = (e) => {
            if (null !== this.CurrentData) {
                if (this._currentData.Finished) {
                    this.CloseCurrentData();
                }
                this.CurrentData.TouchMouseHandler(e);

            }
        }
        this.BindEvents();
    }

    BindEvents() {
        this.canvas.addEventListener("mousedown", this.TouchMouseHandler);
        this.canvas.addEventListener("mousemove", this.TouchMouseHandler);
        this.canvas.addEventListener("mouseup", this.TouchMouseHandler);
        this.canvas.addEventListener("mouseleave", this.TouchMouseHandler);

        // Set up touch events for mobile, etc
        this.canvas.addEventListener("touchstart", this.TouchMouseHandler);
        this.canvas.addEventListener("touchend", this.TouchMouseHandler);
        this.canvas.addEventListener("touchmove", this.TouchMouseHandler);
    }

    CloseCurrentData() {

        if (null !== this._currentData && this._currentData.IsValid) {
            this.History = this.History.slice(0, this.History.length - this.undoLevel);
            this.History.push(this._currentData);
            this.undoLevel = 0;

            this.DestroyCurrentData();
        } 
    }

    DestroyCurrentData() {

        if (null !== this._currentData) {
            this._currentData.Destroy();
            this._currentData = null;
        }
    }

    get CurrentData() {
        if (null === this._currentData) {
            switch (this.mode) {
                case this.modes.stroke:
                    this.CurrentData = new Stroke(this.context, { x_offset: this.x_offset, y_offset: this.y_offset });
                    break;
                case this.modes.line:
                    this.CurrentData = new Line(this.context, { x_offset: this.x_offset, y_offset: this.y_offset });
                    break;
                case this.modes.rectangle:
                    this.CurrentData = new Rectangle(this.context, { x_offset: this.x_offset, y_offset: this.y_offset });
                    break;
                case this.modes.circle:
                    this.CurrentData = new Circle(this.context, { x_offset: this.x_offset, y_offset: this.y_offset });
                    break;
                case this.modes.text:
                    this.CurrentData = new Text(this.context, { x_offset: this.x_offset, y_offset: this.y_offset });
                    break;
                case this.modes.x:
                    this.CurrentData = new X(this.context, { x_offset: this.x_offset, y_offset: this.y_offset });
                    break;
                default:
                case this.modes.none:
                    this.CurrentData = null;
                    break;
            }
        }
        return this._currentData;
    }

    set CurrentData(value) {
        if (null !== this._currentData) {
            this._currentData.Destroy();
        }
        this._currentData = value;
    }

    SetMode(mode) {
        this.CloseCurrentData();
        this.DestroyCurrentData();
        this.mode = mode;
        this.ClearContext(this.context);
        this.DrawToContext(this.context);
    }

    Undo() {
        if (this.History.length > this.undoLevel) {
            this.undoLevel++;
            this.ClearContext(this.context);
            this.DrawToContext(this.context);
        }
    }
    Redo() {
        if (this.undoLevel > 0) {
            this.undoLevel--;
            this.ClearContext(this.context);
            this.DrawToContext(this.context);
        }
    }

    get SVG() {
        //Create a new mock canvas context. Pass in your desired width and height for your svg document.
        var ctx = new C2S(this.canvas.width, this.canvas.height);
        this.DrawToContext(ctx);
        return ctx.getSerializedSvg();

        //switch (type) {
        //    case "serialized":
        //        return ctx.getSerializedSvg();
        //        break;
        //    case "dom":
        //    default:
        //        return ctx.getSvg();

        //}

    }

    get MarkerPoint() {
        if (this.History[0]) {
            return this.History[0].MarkerPoint;
        }
        //else if (this._currentData.IsValid) {
        //    return this._currentData.MarkerPoint;
        //}
    }

    DrawToContext(ctx) {
        this.History.slice(0, this.History.length - this.undoLevel).forEach((markupData) => {
            ctx.save();
            markupData.DrawToContext(ctx);
            ctx.restore();
        });
        if (null != this._currentData && this._currentData.IsValid) {
            ctx.save();
            return this._currentData.DrawToContext(ctx);
            ctx.restore();
        }
        return ctx;
    }
    ClearContext(ctx) {
        // Store the current transformation matrix
        ctx.save();

        // Use the identity matrix while clearing the canvas
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, ctx.canvas.clientWidth, ctx.canvas.clientHeight);

        // Restore the transform
        ctx.restore();
    }

    Destroy() {
        this.History.forEach((m) => { m.Destroy(); })
        if (null != this._currentData) {
            this._currentData.Destroy();
        }
    }
}

class MarkupData {
    constructor(context, _opt = {}) {
        if (!(this instanceof MarkupData)) return new MarkupData(_opt);

        this.options = Object.assign({
            x_offset: 0,
            y_offset: 0
        }, _opt);

        this.context = context;


        this.color = this.options.color || 'red';
        this.s_width = this.options.width || 2;

        this.context.strokeStyle = this.color;
        this.context.lineWidth = this.s_width;

        this.x_offset = this.options.x_offset;
        this.y_offset = this.options.y_offset;

        this.EventLocation = new Point(null, null);
        this._finished = false;
        this._isValid = false;

        this.TouchMouseHandler = (e) => {
            this.CaptureLocation(e);
            this.HandleTouchEvent(e);
        }
    }

    CaptureLocation(e) {
        var ret = { x: null, y: null };
        if (e.type === "touchmove" || e.type === "touchstart") {
            //HANDLE MULTITOCH
            //SHIFT FOR FINGERS
            this.EventLocation.x = e.touches[0].pageX + 0.3;
            this.EventLocation.y = e.touches[0].pageY + 0.3;
        } else {
            this.EventLocation.x = e.pageX;
            this.EventLocation.y = e.pageY;
        }
    }

    get Finished() {
        return this._finished;
    }

    Finish() {
        if (this.IsValid) {
            this.TempContext.closePath();
            this.TempCanvas.remove();
            this.DrawToContext(this.context);

            this._finished = true;
        }
    }

    get IsValid(){
        return this._isValid;
    }

    DrawToContext(ctx) {
        //ABSTRACT
        //DRAW DATA INTO CONTEXT
    }

    ClearContext(ctx) {
        // Store the current transformation matrix
        ctx.save();

        // Use the identity matrix while clearing the canvas
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, ctx.canvas.clientWidth, ctx.canvas.clientHeight);

        // Restore the transform
        ctx.restore();
    }

    RedrawToContext(ctx) {
        this.ClearContext(ctx) 
        this.DrawToContext(ctx);
    }

    Destroy() {
        //ABSTRACT
        //CLEAN UP
        if (this.tempCanvas) {
            this.tempCanvas.remove();
        }
    }

    get TempCanvas() {

        if (!this.tempCanvas) {
            //create a new canvas
            this.tempCanvas = this.context.canvas.cloneNode();
            this.tempCanvas.style.pointerEvents = 'none';
            this.tempCanvas.style.position = 'absolute';
            this.tempCanvas.style.top = 0;
            this.tempCanvas.style.left = 0;

            // ...then set the internal size to match
            this.tempCanvas.width = this.context.canvas.offsetWidth;
            this.tempCanvas.height = this.context.canvas.offsetHeight;


            this.context.canvas.parentNode.appendChild(this.tempCanvas);
        }
        return this.tempCanvas;
    }

    get TempContext() {
        if (!this.tempContext) {
            this.tempContext = this.TempCanvas.getContext("2d");
            this.tempContext.canvas.width = this.context.canvas.clientWidth;
            this.tempContext.canvas.height = this.context.canvas.clientHeight;
        }
        return this.tempContext;
    }

    get FirstPoint() {
        if (null !== this.points) {
            return this.points[0];
        } else {
            return new Point(0, 0);
        }
    } 

    get MarkerPoint() {
        return this.FirstPoint;
    } 

    DrawAtAngle(ctx, point, theta, rotated_action) {
        this.RotateContext(ctx, point, theta);
        rotated_action();
        this.RotateContext(ctx, point, -theta);
    }

    RotateContext(ctx, point, theta) {
        let trans_x = point.x * Math.cos(theta) - point.y * Math.sin(theta);
        let trans_y = point.y * Math.cos(theta) + point.x * Math.sin(theta);

        ctx.translate(point.x - trans_x, point.y - trans_y);
        ctx.rotate(theta);
    }

}

class OnePointMarkup extends MarkupData {

    constructor(markup, _opt = {}) {
        super(markup, _opt);

        this.point = null;
    }

    HandleTouchEvent(e) {
        switch (e.type) {
            case "touchstart":
                this.point = new Point(this.EventLocation.x, this.EventLocation.y);
                this.RedrawToContext(this.TempContext);
                break;

            case "mousedown":
                if (1 === e.buttons) {
                    this.point = new Point(this.EventLocation.x, this.EventLocation.y);
                }
                this.RedrawToContext(this.TempContext);
                break;

            case "touchmove":
            case "mousemove":
            case "touchend":
            case "mouseleave":
            case "mouseup":
                this.Finish();
                break;

            default:
                break;
        }
    }

    get IsValid() {
        return this.point;
    }

    get FirstPoint() {
        if (this.IsValid) {
            return this.point;
        }
    }
}

class TwoPointMarkup extends MarkupData {

    constructor(markup, _opt = {}) {
        super(markup, _opt);

        this.start = null;
        this.end = null;
    }

    HandleTouchEvent(e) {
        switch (e.type) {
            case "touchstart":
                //this.start = new Point(this.EventLocation.x, this.EventLocation.y);
                this.StartTouch(e);
                break;

            case "mousedown":
                if (1 === e.buttons) {
                    //this.start = new Point(this.EventLocation.x, this.EventLocation.y);
                    this.StartTouch(e);
                }
                break;

            case "touchmove":
                this.MoveTouch(e);
                //this.end = new Point(this.EventLocation.x, this.EventLocation.y);
                //this.RedrawToContext(this.TempContext);
                break;

            case "mousemove":
                if (1 === e.buttons) {
                    this.MoveTouch(e);
                    //this.end = new Point(this.EventLocation.x, this.EventLocation.y);
                    //this.RedrawToContext(this.TempContext);
                }
                break;

            case "touchend":
            case "mouseleave":
            case "mouseup":
                this.StopTouch(e);
                //this.Finish();
                break;

            default:
                break;
        }
    }

    StartTouch(e) {
        this.start = new Point(this.EventLocation.x, this.EventLocation.y);
    }

    MoveTouch(e) {
        this.end = new Point(this.EventLocation.x, this.EventLocation.y);
        this.RedrawToContext(this.TempContext);
    }

    StopTouch(e) {
        this.Finish();
    }

    get IsValid() {
        return (this.start !== null && this.end !== null);
    }


    get MarkerPoint() {
        if (this.IsValid) {
            return this.start;
        }
    }
}

class ContinuousMarkup extends MarkupData {
    constructor(markup, _opt = {}) {
        super(markup, _opt);

        this.points = null;


    }
    HandleTouchEvent(e) {


        switch (e.type) {
            case "touchstart":
                this.AddPoint(this.EventLocation.x, this.EventLocation.y);
                break;

            case "mousedown":
                if (1 === e.buttons) {
                    this.AddPoint(this.EventLocation.x, this.EventLocation.y);
                }
                break;

            case "touchmove":
                this.AddPoint(this.EventLocation.x, this.EventLocation.y);
                break;

            case "mousemove":
                if (1 === e.buttons) {
                    this.AddPoint(this.EventLocation.x, this.EventLocation.y);
                }
                break;

            case "touchend":
            case "mouseleave":
            case "mouseup":
                this.Finish()
                break;

            default:
                break;
        }
    }

    AddPoint(_x, _y) {
        if (_x && _y) {
            let x, y;
            x = _x - this.x_offset;
            y = _y - this.y_offset;

            if (!this.points) {
                //first point
                //this.context.closePath();
                //this.context.beginPath();
                this.points = [];
                //this.context.moveTo(x, y);
            }
            //else {
            //    //next point
            //    this.context.lineTo(x, y);
            //    this.context.stroke();
            //}
            this.points.push({ x: x, y: y });

            this.RedrawToContext(this.TempContext);
        }
    }

    get IsValid() {
        if (this.points) {
            return true;
        }
        return false;
    }

    get FirstPoint() {
        if (this.points) {
            return this.points[0];
        }
    }
}

class Stroke extends ContinuousMarkup {
    constructor(markup, _opt = {}) {
        super(markup, _opt);
    }

    DrawToContext(ctx) {
        //DRAW DATA INTO CONTEXT
        ctx.beginPath();
        ctx.strokeStyle = this.color;
        ctx.lineWidth = this.s_width;
        ctx.moveTo(this.points[0].x, this.points[0].y);
        for (var j = 1; j < this.points.length; j++) { //each stroke
            ctx.lineTo(this.points[j].x, this.points[j].y);
            ctx.stroke();
        }
        ctx.closePath();
    }
}

class Line extends TwoPointMarkup {
    constructor(markup, _opt = {}) {
        super(markup, _opt);
    }

    DrawToContext(ctx) {
        //DRAW DATA INTO CONTEXT
        ctx.beginPath();

        ctx.strokeStyle = this.color;
        ctx.lineWidth = this.s_width;

        ctx.moveTo(this.start.x, this.start.y);
        ctx.lineTo(this.end.x, this.end.y);
        ctx.stroke();

        ctx.closePath();
    }
}

class Rectangle extends TwoPointMarkup {
    constructor(markup, _opt = {}) {
        super(markup, _opt);
    }

    DrawToContext(ctx) {
        //DRAW DATA INTO CONTEXT
        ctx.beginPath();

        ctx.strokeStyle = this.color;
        ctx.lineWidth = this.s_width;

        ctx.moveTo(this.start.x, this.start.y);
        ctx.lineTo(this.end.x, this.start.y);
        ctx.lineTo(this.end.x, this.end.y);
        ctx.lineTo(this.start.x, this.end.y);
        ctx.lineTo(this.start.x, this.start.y);

        //ctx.strokeRect(this.start.x, this.start.y, this.end.x - this.start.x, this.end.y - this.start.y);

        ctx.stroke();

        ctx.closePath();
    }
}

class Circle extends TwoPointMarkup {
    constructor(markup, _opt = {}) {
        super(markup, _opt);       

    }

    DrawToContext(ctx) {
        //DRAW DATA INTO CONTEXT
        ctx.beginPath();

        ctx.strokeStyle = this.color;
        ctx.lineWidth = this.s_width;
        ctx.fillStyle = "";

        let radius = Math.sqrt(Math.pow(this.start.x - this.end.x, 2) + Math.pow(this.start.y - this.end.y,2))
        ctx.arc(this.start.x, this.start.y, radius, 0,2*Math.PI);
        
        ctx.stroke();

        ctx.closePath();
    }
}

class Text extends TwoPointMarkup {
    constructor(markup, _opt = {}) {
        super(markup, _opt);

        this.opts = Object.assign({
            font: '',
            fillStyle: "",
            fillText: ""
        }, this.opts);

        this.Reset();
    }

    Reset() {
        this.lines = [];
        this.start = null;
        this.end = null;
        this.stopping = false;
        this.ClearContext(this.TempContext);
        this.DrawToContext = this.DrawCursorToContext;
    }

    async StopTouch(e) {
        if (super.IsValid && !this.stopping) {
            this.stopping = true;
            this.DrawToContext = this.DrawTextToContext;

            try {
                var text = await Utility.modal.InputMultiline();
                this.lines = text.split("\n");
            }
            catch (err)
            {
                
            }

            if (!this.IsValid) {
                this._finished = true;
                this.Reset();
                return;
            }
        }
        super.StopTouch(e);
    }

    get FontHeight() {
        return Math.sqrt(Math.pow(this.start.x - this.end.x, 2) + Math.pow(this.start.y - this.end.y, 2));
    }

    get LineAngle() {
        let theta = Math.atan2(-(this.start.y - this.end.y), -(this.start.x - this.end.x));

        return theta;
    }

    get FontAngle() {
        //90 deg from line angle
        let theta = this.LineAngle;// - Math.PI / 2; 

        //SNAP TO NEAREST 90
        let snap_angle = Math.PI / 180.0 *5.0;
        if (0 - snap_angle <= theta && theta <= 0 + snap_angle) {
            theta= 0;
        } else if (-Math.PI / 2 - snap_angle <= theta && theta <= -Math.PI / 2 + snap_angle) {
            theta = -Math.PI / 2;
        } else if (-Math.PI + snap_angle >= theta || theta >= Math.PI - snap_angle) {
            theta = Math.PI;
        } else if (Math.PI / 2 - snap_angle <= theta && theta <= Math.PI / 2 + snap_angle) {
            theta = Math.PI / 2;
        }

        //else if (Math.PI / 2 - snap_angle <= theta && theta <= Math.PI / 2 + snap_angle) {
        //    theta = Math.PI / 2;
        //} else if (-Math.PI / 2 - snap_angle <= theta && theta <= -Math.PI / 2 + snap_angle) {
        //    theta = -Math.PI / 2;
        //} 
        //console.log(`Font angle: ${theta}`);
        return theta - Math.PI / 2; 
    }

    get IsValid() {
        return this.lines.join('').length > 0 && super.IsValid;
    }

    DrawCursorToContext(ctx) {
        //DRAW DATA INTO CONTEXT
        ctx.beginPath();

        ctx.strokeStyle = this.color;
        ctx.lineWidth = this.s_width;

        ctx.moveTo(this.start.x, this.start.y);
        ctx.lineTo(this.end.x, this.end.y);
        ctx.stroke();


        ctx.font = `${Math.round(this.FontHeight * 1.50)}px Arial`;
        ctx.fillStyle = "red";

        this.DrawAtAngle(ctx, this.end, this.FontAngle, () => {
            ctx.moveTo(this.end.x + 5, this.end.y);
            ctx.lineTo(this.end.x + 50, this.end.y);
            ctx.stroke();
        });

        ctx.closePath();
    }

    DrawTextToContext(ctx) {
        //DRAW DATA INTO CONTEXT
        let text_height = Math.round(this.FontHeight * 1.50)
        ctx.font = `${text_height}px Monospace`;
        ctx.fillStyle = "red";

        let text_point = this.end;

        let theta_rad = this.FontAngle;
        this.RotateContext(ctx, text_point, theta_rad);
        for (var i = 0; i < this.lines.length; i++) {
            ctx.fillText(this.lines[i], text_point.x, text_point.y + text_height*i);
        }
        this.RotateContext(ctx, text_point, -theta_rad);

        //if (!this.Finished) {
        //    this.DrawCursorToContext(ctx);
        //}
        
    }
}

class X extends TwoPointMarkup {
    constructor(markup, _opt = {}) {
        super(markup, _opt);
    }

    DrawToContext(ctx) {
        //DRAW DATA INTO CONTEXT
        ctx.beginPath();

        ctx.strokeStyle = this.color;
        ctx.lineWidth = this.s_width;

        ctx.moveTo(this.start.x, this.start.y);
        ctx.lineTo(this.end.x, this.end.y);
        ctx.moveTo(this.start.x, this.end.y);
        ctx.lineTo(this.end.x, this.start.y);

        ctx.stroke();

        ctx.closePath();
    }
}

class Point {
    constructor(x,y) {
        this.x = x;
        this.y = y;
    }
}
