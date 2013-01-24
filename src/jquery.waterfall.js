/**
 * 基于绝对定位的瀑布流（依赖于 jQuery，因 jQ 1.5 在 ie9 下有 bug，应使用 1.6 或以上）
 *
 * 仅适用于列等宽的情况。
 *
 * 允许指定最小列数、最大列数、是否在浏览器窗口缩放的时候进行重排、加载处理等。
 *
 * @module Waterfall
 * @requires jQuery
 */
(function(window, $) {
    var $window = $(window),
        $body = $('body');

    /**
     * 默认配置
     *
      container:   {jQ元素}   $('#id'), 直接的元素列表容器，jQuery 对象
      colWidth:    {Number}   包括 border 在内的可见宽度（不包括 margin），单位是 px
      minCol:      {Number}   至少要多少列，默认为 1（不做合法性判断，如 -1，0 等，需自行约束）
      maxCol:      {Number}   最多可以多少列，默认为 10 （可以设为 null 等非 true 值来表示不限制，同不做合法性判断）
      gapWidth:    {Number}   项与项之间的水平分隔宽度，默认为 15，单位是 px
      gapHeight:   {Number}   上下项的垂直分隔高度，默认为 15， 单位是 px
      resizeDelay: {Number}   浏览器窗口缩放时进行调整的延迟时间，默认为 0，单位是 ms
      laodDelay:   {Number}   滚动加载前的延迟时间，默认是 0，单位是 ms
      preDistancs: {Number}   距离底部多少像素就开始加载，默认是 100，单位是 px
      oninit:      {Function} 初始化完毕后的处理函数，默认为 null
      onbeforeLoad:{Function} 开始滚动加载前的处理函数，默认为 null
      load:        {Function} 滚动加载的处理函数，默认为null
      resizeable:  {Boolean}  是否缩放调整，默认为 true
      onresize:    {Function} 窗口大小调整完毕后的处理函数，可用于对别的元素进行宽度同步等，默认为 null
     *
     * @property defaultOptions
     * @type JSON
     */
    var defaultOptions = {
        container: null,
        colWidth: 0,
        minCol: 1,
        maxCol: 10,
        gapWidth: 15,
        gapHeight: 15,
        resizeDelay: 0,
        loadDelay: 0,
        preDistance: 100,
        onbeforeLoad: null,
        load: null,
        resizeable: true,
        onresize: null,
        oninit: null
    };

    /**
     * 基于绝对定位的瀑布流
     *
     * @class Waterfall
     * @constructor
     * @param {JSON} options 参数配置，新传入的键值对将会覆盖 `defaultOptions` 中对应的项。.
     * @example

        var page = 1;
        var wf = new Waterfall({
            container: $('#container'),
            colWidth: 200,
            maxCol: 5,
            preDistance: 100,
            load: function(){
                // 触发滚动加载时的具体操作
                // 当前作用域下，this指向正创建的对象
                var self = this;

                $.get('more.php', {page: page}, function(data) {
                    page++;

                    var res = [];

                    $.each(data.items, function(i, item){
                        res.push('<div class="item"><img src="' + item.src + '" width="200" height="' + item.h + '" /></div>');
                    });

                    // 把新增加的项添加进瀑布流并允许下一次加载
                    self.success(res);

                    if (data.end) {
                        // 无下一页时结束滚动加载
                        self.end();
                        $('#end').show();
                    };
                }, 'json');
            }
        });

     */
    function Waterfall(options) {
        this.options = $.extend({}, defaultOptions, options);
        this._init();
        this._bind();
    }

    Waterfall.prototype = {
        /**
         * 初始化函数
         *
         * 对参数进行基本的检查。初始化一些数据，设定列表容器的宽高，然后尝试首次请求加载数据
         *
         * @method _init
         * @private
         */
        _init: function() {
            var op = this.options;

            if (!op.container) {
                throw new Error('miss container');
            }

            if (op.maxCol) {
                if (op.minCol > op.maxCol) {
                    throw new Error('minCol should be less than maxCol');
                }
            }

            /**
             * 待应用的元素样式队列
             *
             * @property styleQueue
             * @type JSON
             */
            this.styleQueue = [];

            this._resetColHeightArr();
            this._resetWidth();
            /**
             * 瀑布流的状态
             *
               ready:     准备就绪
               rendering: 渲染中（比如新增加数据的时候）
               loading:   加载数据中
               end:       停止加载数据

             * @property state
             * @type String
             */
            this.state = 'ready';
            op.oninit && op.oninit();
            this._firstLoad();
        },
        /**
         * 根据窗口宽度、列宽、列间距来确定显示列数，并根据 `minCol` 和 `maxCol` 来进行调整
         *
         * 同时存储到当前对象的 `colCount` 成员中。
         *
         * @method _resetColCount
         * @private
         */
        _resetColCount: function() {
            var op = this.options;
            var count = Math.floor(($window.width() + op.gapWidth) /
                    (op.colWidth + op.gapWidth));
            if (count < op.minCol) {
                count = op.minCol;
            }
            if (op.maxCol && (count > op.maxCol)) {
                count = op.maxCol;
            }
            this.colCount = count;
        },
        /**
         * 重设 container 的宽度
         * 算法：n * colWidth + (n - 1) * gapWidth
         *  n:           列数
         *  colWidth:    列宽
         *  gapWdith:    列间距
         *
         *  @method _resetWidth
         *  @private
         */
        _resetWidth: function() {
            var op = this.options,
                n = this.colCount;
            op.container[0].style.width = n * op.colWidth + (n - 1) * op.gapWidth + 'px';
        },
        /**
         * 调用 `_resetColCount` 来重定列数；
         * 把记录每列高度的数组元素都重置为 0
         *
         * @method _resetColHeightArr
         * @private
         */
        _resetColHeightArr: function() {
            this._resetColCount();
            this.colHeightArr = [];
            for (var i = 0, l = this.colCount; i < l; i++) {
                this.colHeightArr[i] = 0;
            }
        },
        /**
         * 把一系列的项进行定位
         *
         * 处于效率的考虑（js岛和dom岛），先计算好所有元素的位置，用 {jQ化的DOM元素, 位置对象} 的形式保存进 `styleQueue` 数组；
         * 然后再进行一一进行样式更改
         *
         * 同时，把 `container` 的高度做调整
         *
         * @method layout
         * @param {Array} $items 待定位的项的DOM数组.
         */
        layout: function($items) {
            var self = this,
                op = self.options;
                l = $items.length;
            for (var i = 0; i < l; i++) {
                self._placeItem($items[i]);
            }

            op.container.css('height', self.getMaxHeight());

            for (var j = 0, sl = self.styleQueue.length; j < sl; j++) {
                var obj = self.styleQueue[j];
                obj.$ele.css(obj.style);
            }

            self.styleQueue = [];
        },
        /**
         * 在瀑布流中新增一项
         *
         * 算法：调用 getMinHIndex 来获取高度最小的列的索引，
         *      然后把该项插入到 container 中；
         *      然后调用 _rePosItem 根据列索引来定位；
         *      完毕后给该项增加一个 ready 的 class 标志，同时把瀑布流的 state 设为 ready
         *
         * @method addItem
         * @param {Object} item 待增加的项，类型可以是 html 代码、dom 元素和 jQ 元素对象.
         */
        addItem: function(item) {
            this.state = 'rendering';
            var $item = $(item);
            var inx = this.getMinHIndex();
            this.options.container.append($item);
            this.layout([$item]);
            $item.addClass('ready');
            this.state = 'ready';
        },
        /**
         * 计算给定的元素的绝对定位位置
         *
         * 首先找出当前页面高度最小的列的索引（`inx`），然后计算出 `top` 和 `left` 组成的 `pos` 对象，
         * 然后把该对象和给定的元素组成的新对象 push 进 `styleQueue` 数组中，等待 `layout` 函数调用处理。
         *
         * 同时把列高数组中 inx 处的值增大
         *
         * @method _placeItem
         * @private
         */
        _placeItem: function(item) {
            var self = this,
                op = this.options,
                $item = $(item),
                inx = self.getMinHIndex();
                pos = {
                    left: inx * (op.colWidth + op.gapWidth),
                    top: self.colHeightArr[inx]
                };

            self.colHeightArr[inx] += op.gapHeight + $item.outerHeight();

            self.styleQueue.push({$ele: $item, style: pos});
        },
        /**
         * 获取高度最小的列的索引（索引从 0 开始）
         *
         * @method getMinHIndex
         */
        getMinHIndex: function() {
            var inx = 0,
                arr = this.colHeightArr,
                l = arr.length;

            for (var i = 1; i < l; i++) {
                if (arr[i] < arr[inx]) {
                    inx = i;
                }
            }
            return inx;
        },
        /**
         * 获取所有列的最大高度
         *
         * @method getMaxHeight
         */
        getMaxHeight: function() {
            var arr = this.colHeightArr,
                l = arr.length,
                max = 0;

            for (var i = 0; i < l; i++) {
                if (max < arr[i]) {
                    max = arr[i];
                }
            }
            return max;
        },
        /**
         * 绑定瀑布流的事件，包括 `resize` 和 `scroll`
         *
         * @method _bind
         * @private
         */
        _bind: function() {
            var self = this;
            /*
             * ie8 及以下 body 的高度变化会导致 window 的 resize 事件
             * fix 方法是通过在 body 下新增一个 div 层，然后把 resize 事件绑定在这个层上
             */
             if (self.options.resizeable) {
                if ($.browser.msie && parseInt($.browser.version, 10) <= 8) {
                    var g = document.createElement('div');
                    g.style.cssText = 'width:100%;height:0px;position:absolute;bottom:0px;left:0px;overflow:hidden';
                    document.body.appendChild(g);
                    g.onresize = function() {self._resize();};
                } else {
                    $window.bind('resize', function() {self._resize();});
                }
            }

            // 为了能够 unbind，必须使用命名函数；
            // 事件绑定中， this 指向触发事件的元素；
            // 为了能使用对象的命名函数，需要重新绑定 this
            $window.bind('scroll', $.proxy(self._load, self));
        },
        /**
         * window resize 时的处理函数
         *
         * @method _resize
         * @private
         */
        _resize: function() {
            var self = this;

            // 使用 timer 来减少触发和稍稍延迟
            if (self.resizeTimer) {
                clearTimeout(self.resizeTimer);
            }

            self.resizeTimer = setTimeout(function() {
              self.doResize();
            }, self.options.resizeDelay);
        },
        /**
         * 具体的 resize 处理函数
         *
         * 需要重设列数、列高和 container 宽度，
         * 然后把每一项进行遍历来重定位，
         * 然后尝试加载
         *
         * 这里要求每一项是 container 的直接子元素
         *
         * @method doResize
         */
        doResize: function() {
            var self = this,
                op = self.options;
            self._resetColHeightArr();
            self._resetWidth();
            self.layout(op.container.children());
            op.onresize && op.onresize();
            setTimeout(function() {
                self._load.call(self);
            }, 300);

        },
        /**
         * 触发加载新内容
         *
         * 当 state 为 ready 并且滚动到底部或没出现竖向滚动条时尝试加载
         *
         * @method _load
         * @private
         */
        _load: function() {
            var self = this,
                op = self.options;

            // when ready
            // if no vertical scrollbar
            // or scroll to the bottom
            //  $window.height() >= $body.outerHeight() ||
            if (self.state == 'ready' && ($window.height() + op.preDistance >= op.container.get(0).getBoundingClientRect().top + op.container.height())) {
                self.doLoad();
            }
        },
        /**
         * 调用配置参数中传入的 load 函数
         *
         * 执行前先把 state 设为 loading，需要在加载完成后调用 `this.success()` 来允许下一次加载或 `this.end()` 来结束滚动加载。
         *
         * @method doLoad
         */
        doLoad: function() {
            var self = this,
                op = self.options;

            op.onbeforeLoad && op.onbeforeLoad();

            self.state = 'loading';
            setTimeout(function() {
                op.load && op.load.call(self);
            }, self.options.loadDelay);

        },
        /**
         * 初始化的时候尝试加载
         *
         * @method _firstLoad
         * @private
         */
        _firstLoad: function() {
            while (this.state == 'ready' && $window.height() >= $body.outerHeight()) {
                this._load();
            }
        },
        /**
         * 新内容请求成功后的清理函数
         *
         * 允许传入一个数组，数组元素是瀑布流每项的内容，
         * 这样可以在这里实现添加到列表的功能而不必在 load 函数中手动调用 addItem 方法
         *
         * 完毕后把 state 设为 ready
         *
         * @method success
         * @param {Array} [itemsArr] 待添加进瀑布流的项组成的数组，项可以是 HTML 代码，可以是 DOM 元素，也可以是 jQ 元素对象
         */
        success: function(itemsArr) {
            var self = this;
            if (itemsArr && $.isArray(itemsArr)) {
                $.each(itemsArr, function(i, item) {
                    self.addItem(item);
                });
            }
            self.state = 'ready';
        },
        /**
         * 结束滚动加载
         *
         * 将把 `state` 设为 `"end"`，并且移除 `scroll` 事件
         *
         * @method end
         */
        end: function() {
            var self = this;
            self.state = 'end';
            $window.unbind('scroll', $.proxy(self._load, self));
        }
    };

    window.Waterfall = Waterfall;
})(window, jQuery);
