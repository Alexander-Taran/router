'use strict';

System.register(['aurelia-logging', 'aurelia-route-recognizer', 'aurelia-dependency-injection', 'aurelia-history', 'aurelia-event-aggregator'], function (_export, _context) {
  var LogManager, RouteRecognizer, Container, History, EventAggregator, _typeof, _createClass, isRootedPath, isAbsoluteUrl, pipelineStatus, Pipeline, CommitChangesStep, NavigationInstruction, NavModel, Redirect, RedirectToRoute, RouterConfiguration, activationStrategy, BuildNavigationPlanStep, Router, CanDeactivatePreviousStep, CanActivateNextStep, DeactivatePreviousStep, ActivateNextStep, RouteLoader, LoadRouteStep, PipelineProvider, logger, AppRouter;

  function _possibleConstructorReturn(self, call) {
    if (!self) {
      throw new ReferenceError("this hasn't been initialised - super() hasn't been called");
    }

    return call && (typeof call === "object" || typeof call === "function") ? call : self;
  }

  function _inherits(subClass, superClass) {
    if (typeof superClass !== "function" && superClass !== null) {
      throw new TypeError("Super expression must either be null or a function, not " + typeof superClass);
    }

    subClass.prototype = Object.create(superClass && superClass.prototype, {
      constructor: {
        value: subClass,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
    if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass;
  }

  function _classCallCheck(instance, Constructor) {
    if (!(instance instanceof Constructor)) {
      throw new TypeError("Cannot call a class as a function");
    }
  }

  function createCompletionHandler(next, status) {
    return function (output) {
      return Promise.resolve({ status: status, output: output, completed: status === pipelineStatus.completed });
    };
  }

  function prune(instruction) {
    instruction.previousInstruction = null;
    instruction.plan = null;
  }

  function hasDifferentParameterValues(prev, next) {
    var prevParams = prev.params;
    var nextParams = next.params;
    var nextWildCardName = next.config.hasChildRouter ? next.getWildCardName() : null;

    for (var key in nextParams) {
      if (key === nextWildCardName) {
        continue;
      }

      if (prevParams[key] !== nextParams[key]) {
        return true;
      }
    }

    for (var _key in prevParams) {
      if (_key === nextWildCardName) {
        continue;
      }

      if (prevParams[_key] !== nextParams[_key]) {
        return true;
      }
    }

    if (!next.options.compareQueryParams) {
      return false;
    }

    var prevQueryParams = prev.queryParams;
    var nextQueryParams = next.queryParams;
    for (var _key2 in nextQueryParams) {
      if (prevQueryParams[_key2] !== nextQueryParams[_key2]) {
        return true;
      }
    }

    for (var _key3 in prevQueryParams) {
      if (prevQueryParams[_key3] !== nextQueryParams[_key3]) {
        return true;
      }
    }

    return false;
  }

  function getInstructionBaseUrl(instruction) {
    var instructionBaseUrlParts = [];
    instruction = instruction.parentInstruction;

    while (instruction) {
      instructionBaseUrlParts.unshift(instruction.getBaseUrl());
      instruction = instruction.parentInstruction;
    }

    instructionBaseUrlParts.unshift('/');
    return instructionBaseUrlParts.join('');
  }

  function validateRouteConfig(config) {
    if ((typeof config === 'undefined' ? 'undefined' : _typeof(config)) !== 'object') {
      throw new Error('Invalid Route Config');
    }

    if (typeof config.route !== 'string') {
      throw new Error('Invalid Route Config: You must specify a route pattern.');
    }

    if (!('redirect' in config || config.moduleId || config.navigationStrategy || config.viewPorts)) {
      throw new Error('Invalid Route Config: You must specify a moduleId, redirect, navigationStrategy, or viewPorts.');
    }
  }

  function evaluateNavigationStrategy(instruction, evaluator, context) {
    return Promise.resolve(evaluator.call(context, instruction)).then(function () {
      if (!('viewPorts' in instruction.config)) {
        instruction.config.viewPorts = {
          'default': {
            moduleId: instruction.config.moduleId
          }
        };
      }

      return instruction;
    });
  }

  function processDeactivatable(plan, callbackName, next, ignoreResult) {
    var infos = findDeactivatable(plan, callbackName);
    var i = infos.length;

    function inspect(val) {
      if (ignoreResult || shouldContinue(val)) {
        return iterate();
      }

      return next.cancel(val);
    }

    function iterate() {
      if (i--) {
        try {
          var viewModel = infos[i];
          var _result = viewModel[callbackName]();
          return processPotential(_result, inspect, next.cancel);
        } catch (error) {
          return next.cancel(error);
        }
      }

      return next();
    }

    return iterate();
  }

  function findDeactivatable(plan, callbackName) {
    var list = arguments.length <= 2 || arguments[2] === undefined ? [] : arguments[2];

    for (var viewPortName in plan) {
      var _viewPortPlan = plan[viewPortName];
      var prevComponent = _viewPortPlan.prevComponent;

      if ((_viewPortPlan.strategy === activationStrategy.invokeLifecycle || _viewPortPlan.strategy === activationStrategy.replace) && prevComponent) {
        var viewModel = prevComponent.viewModel;

        if (callbackName in viewModel) {
          list.push(viewModel);
        }
      }

      if (_viewPortPlan.childNavigationInstruction) {
        findDeactivatable(_viewPortPlan.childNavigationInstruction.plan, callbackName, list);
      } else if (prevComponent) {
        addPreviousDeactivatable(prevComponent, callbackName, list);
      }
    }

    return list;
  }

  function addPreviousDeactivatable(component, callbackName, list) {
    var childRouter = component.childRouter;

    if (childRouter && childRouter.currentInstruction) {
      var viewPortInstructions = childRouter.currentInstruction.viewPortInstructions;

      for (var viewPortName in viewPortInstructions) {
        var _viewPortInstruction2 = viewPortInstructions[viewPortName];
        var prevComponent = _viewPortInstruction2.component;
        var prevViewModel = prevComponent.viewModel;

        if (callbackName in prevViewModel) {
          list.push(prevViewModel);
        }

        addPreviousDeactivatable(prevComponent, callbackName, list);
      }
    }
  }

  function processActivatable(navigationInstruction, callbackName, next, ignoreResult) {
    var infos = findActivatable(navigationInstruction, callbackName);
    var length = infos.length;
    var i = -1;

    function inspect(val, router) {
      if (ignoreResult || shouldContinue(val, router)) {
        return iterate();
      }

      return next.cancel(val);
    }

    function iterate() {
      i++;

      if (i < length) {
        try {
          var _ret3 = function () {
            var _current$viewModel;

            var current = infos[i];
            var result = (_current$viewModel = current.viewModel)[callbackName].apply(_current$viewModel, current.lifecycleArgs);
            return {
              v: processPotential(result, function (val) {
                return inspect(val, current.router);
              }, next.cancel)
            };
          }();

          if ((typeof _ret3 === 'undefined' ? 'undefined' : _typeof(_ret3)) === "object") return _ret3.v;
        } catch (error) {
          return next.cancel(error);
        }
      }

      return next();
    }

    return iterate();
  }

  function findActivatable(navigationInstruction, callbackName) {
    var list = arguments.length <= 2 || arguments[2] === undefined ? [] : arguments[2];
    var router = arguments[3];

    var plan = navigationInstruction.plan;

    Object.keys(plan).filter(function (viewPortName) {
      var viewPortPlan = plan[viewPortName];
      var viewPortInstruction = navigationInstruction.viewPortInstructions[viewPortName];
      var viewModel = viewPortInstruction.component.viewModel;

      if ((viewPortPlan.strategy === activationStrategy.invokeLifecycle || viewPortPlan.strategy === activationStrategy.replace) && callbackName in viewModel) {
        list.push({
          viewModel: viewModel,
          lifecycleArgs: viewPortInstruction.lifecycleArgs,
          router: router
        });
      }

      if (viewPortPlan.childNavigationInstruction) {
        findActivatable(viewPortPlan.childNavigationInstruction, callbackName, list, viewPortInstruction.component.childRouter || router);
      }
    });

    return list;
  }

  function shouldContinue(output, router) {
    if (output instanceof Error) {
      return false;
    }

    if (isNavigationCommand(output)) {
      if (typeof output.setRouter === 'function') {
        output.setRouter(router);
      }

      return !!output.shouldContinueProcessing;
    }

    if (output === undefined) {
      return true;
    }

    return output;
  }

  function processPotential(obj, resolve, reject) {
    if (obj && typeof obj.then === 'function') {
      return Promise.resolve(obj).then(resolve).catch(reject);
    }

    try {
      return resolve(obj);
    } catch (error) {
      return reject(error);
    }
  }

  function loadNewRoute(routeLoader, navigationInstruction) {
    var toLoad = determineWhatToLoad(navigationInstruction);
    var loadPromises = toLoad.map(function (current) {
      return loadRoute(routeLoader, current.navigationInstruction, current.viewPortPlan);
    });

    return Promise.all(loadPromises);
  }

  function determineWhatToLoad(navigationInstruction) {
    var toLoad = arguments.length <= 1 || arguments[1] === undefined ? [] : arguments[1];

    var plan = navigationInstruction.plan;

    for (var viewPortName in plan) {
      var _viewPortPlan2 = plan[viewPortName];

      if (_viewPortPlan2.strategy === activationStrategy.replace) {
        toLoad.push({ viewPortPlan: _viewPortPlan2, navigationInstruction: navigationInstruction });

        if (_viewPortPlan2.childNavigationInstruction) {
          determineWhatToLoad(_viewPortPlan2.childNavigationInstruction, toLoad);
        }
      } else {
        var _viewPortInstruction3 = navigationInstruction.addViewPortInstruction(viewPortName, _viewPortPlan2.strategy, _viewPortPlan2.prevModuleId, _viewPortPlan2.prevComponent);

        if (_viewPortPlan2.childNavigationInstruction) {
          _viewPortInstruction3.childNavigationInstruction = _viewPortPlan2.childNavigationInstruction;
          determineWhatToLoad(_viewPortPlan2.childNavigationInstruction, toLoad);
        }
      }
    }

    return toLoad;
  }

  function loadRoute(routeLoader, navigationInstruction, viewPortPlan) {
    var moduleId = viewPortPlan.config.moduleId;

    return loadComponent(routeLoader, navigationInstruction, viewPortPlan.config).then(function (component) {
      var viewPortInstruction = navigationInstruction.addViewPortInstruction(viewPortPlan.name, viewPortPlan.strategy, moduleId, component);

      var childRouter = component.childRouter;
      if (childRouter) {
        var path = navigationInstruction.getWildcardPath();

        return childRouter._createNavigationInstruction(path, navigationInstruction).then(function (childInstruction) {
          viewPortPlan.childNavigationInstruction = childInstruction;

          return _buildNavigationPlan(childInstruction).then(function (childPlan) {
            childInstruction.plan = childPlan;
            viewPortInstruction.childNavigationInstruction = childInstruction;

            return loadNewRoute(routeLoader, childInstruction);
          });
        });
      }
    });
  }

  function loadComponent(routeLoader, navigationInstruction, config) {
    var router = navigationInstruction.router;
    var lifecycleArgs = navigationInstruction.lifecycleArgs;

    return routeLoader.loadRoute(router, config, navigationInstruction).then(function (component) {
      var viewModel = component.viewModel;
      var childContainer = component.childContainer;

      component.router = router;
      component.config = config;

      if ('configureRouter' in viewModel) {
        var _ret4 = function () {
          var childRouter = childContainer.getChildRouter();
          component.childRouter = childRouter;

          return {
            v: childRouter.configure(function (c) {
              return viewModel.configureRouter.apply(viewModel, [c, childRouter].concat(lifecycleArgs));
            }).then(function () {
              return component;
            })
          };
        }();

        if ((typeof _ret4 === 'undefined' ? 'undefined' : _typeof(_ret4)) === "object") return _ret4.v;
      }

      return component;
    });
  }

  function processResult(instruction, result, instructionCount, router) {
    if (!(result && 'completed' in result && 'output' in result)) {
      result = result || {};
      result.output = new Error('Expected router pipeline to return a navigation result, but got [' + JSON.stringify(result) + '] instead.');
    }

    var finalResult = null;
    if (isNavigationCommand(result.output)) {
      result.output.navigate(router);
    } else {
      finalResult = result;

      if (!result.completed) {
        if (result.output instanceof Error) {
          logger.error(result.output);
        }

        restorePreviousLocation(router);
      }
    }

    return router._dequeueInstruction(instructionCount + 1).then(function (innerResult) {
      return finalResult || innerResult || result;
    });
  }

  function resolveInstruction(instruction, result, isInnerInstruction, router) {
    instruction.resolve(result);

    if (!isInnerInstruction) {
      router.isNavigating = false;
      var eventArgs = { instruction: instruction, result: result };
      var eventName = void 0;

      if (result.output instanceof Error) {
        eventName = 'error';
      } else if (!result.completed) {
        eventName = 'canceled';
      } else {
        var _queryString = instruction.queryString ? '?' + instruction.queryString : '';
        router.history.previousLocation = instruction.fragment + _queryString;
        eventName = 'success';
      }

      router.events.publish('router:navigation:' + eventName, eventArgs);
      router.events.publish('router:navigation:complete', eventArgs);
    }

    return result;
  }

  function restorePreviousLocation(router) {
    var previousLocation = router.history.previousLocation;
    if (previousLocation) {
      router.navigate(router.history.previousLocation, { trigger: false, replace: true });
    } else {
      logger.error('Router navigation failed, and no previous location could be restored.');
    }
  }
  return {
    setters: [function (_aureliaLogging) {
      LogManager = _aureliaLogging;
    }, function (_aureliaRouteRecognizer) {
      RouteRecognizer = _aureliaRouteRecognizer.RouteRecognizer;
    }, function (_aureliaDependencyInjection) {
      Container = _aureliaDependencyInjection.Container;
    }, function (_aureliaHistory) {
      History = _aureliaHistory.History;
    }, function (_aureliaEventAggregator) {
      EventAggregator = _aureliaEventAggregator.EventAggregator;
    }],
    execute: function () {
      _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) {
        return typeof obj;
      } : function (obj) {
        return obj && typeof Symbol === "function" && obj.constructor === Symbol ? "symbol" : typeof obj;
      };

      _createClass = function () {
        function defineProperties(target, props) {
          for (var i = 0; i < props.length; i++) {
            var descriptor = props[i];
            descriptor.enumerable = descriptor.enumerable || false;
            descriptor.configurable = true;
            if ("value" in descriptor) descriptor.writable = true;
            Object.defineProperty(target, descriptor.key, descriptor);
          }
        }

        return function (Constructor, protoProps, staticProps) {
          if (protoProps) defineProperties(Constructor.prototype, protoProps);
          if (staticProps) defineProperties(Constructor, staticProps);
          return Constructor;
        };
      }();

      function _normalizeAbsolutePath(path, hasPushState) {
        var absolute = arguments.length <= 2 || arguments[2] === undefined ? false : arguments[2];

        if (!hasPushState && path[0] !== '#') {
          path = '#' + path;
        }

        if (hasPushState && absolute) {
          path = path.substring(1, path.length);
        }

        return path;
      }

      _export('_normalizeAbsolutePath', _normalizeAbsolutePath);

      function _createRootedPath(fragment, baseUrl, hasPushState, absolute) {
        if (isAbsoluteUrl.test(fragment)) {
          return fragment;
        }

        var path = '';

        if (baseUrl.length && baseUrl[0] !== '/') {
          path += '/';
        }

        path += baseUrl;

        if ((!path.length || path[path.length - 1] !== '/') && fragment[0] !== '/') {
          path += '/';
        }

        if (path.length && path[path.length - 1] === '/' && fragment[0] === '/') {
          path = path.substring(0, path.length - 1);
        }

        return _normalizeAbsolutePath(path + fragment, hasPushState, absolute);
      }

      _export('_createRootedPath', _createRootedPath);

      function _resolveUrl(fragment, baseUrl, hasPushState) {
        if (isRootedPath.test(fragment)) {
          return _normalizeAbsolutePath(fragment, hasPushState);
        }

        return _createRootedPath(fragment, baseUrl, hasPushState);
      }

      _export('_resolveUrl', _resolveUrl);

      isRootedPath = /^#?\//;
      isAbsoluteUrl = /^([a-z][a-z0-9+\-.]*:)?\/\//i;

      _export('pipelineStatus', pipelineStatus = {
        completed: 'completed',
        canceled: 'canceled',
        rejected: 'rejected',
        running: 'running'
      });

      _export('pipelineStatus', pipelineStatus);

      _export('Pipeline', Pipeline = function () {
        function Pipeline() {
          _classCallCheck(this, Pipeline);

          this.steps = [];
        }

        Pipeline.prototype.addStep = function addStep(step) {
          var run = void 0;

          if (typeof step === 'function') {
            run = step;
          } else if (typeof step.getSteps === 'function') {
            var steps = step.getSteps();
            for (var i = 0, l = steps.length; i < l; i++) {
              this.addStep(steps[i]);
            }

            return this;
          } else {
            run = step.run.bind(step);
          }

          this.steps.push(run);

          return this;
        };

        Pipeline.prototype.run = function run(instruction) {
          var index = -1;
          var steps = this.steps;

          function next() {
            index++;

            if (index < steps.length) {
              var currentStep = steps[index];

              try {
                return currentStep(instruction, next);
              } catch (e) {
                return next.reject(e);
              }
            } else {
              return next.complete();
            }
          }

          next.complete = createCompletionHandler(next, pipelineStatus.completed);
          next.cancel = createCompletionHandler(next, pipelineStatus.canceled);
          next.reject = createCompletionHandler(next, pipelineStatus.rejected);

          return next();
        };

        return Pipeline;
      }());

      _export('Pipeline', Pipeline);

      _export('CommitChangesStep', CommitChangesStep = function () {
        function CommitChangesStep() {
          _classCallCheck(this, CommitChangesStep);
        }

        CommitChangesStep.prototype.run = function run(navigationInstruction, next) {
          return navigationInstruction._commitChanges(true).then(function () {
            navigationInstruction._updateTitle();
            return next();
          });
        };

        return CommitChangesStep;
      }());

      _export('CommitChangesStep', CommitChangesStep);

      _export('NavigationInstruction', NavigationInstruction = function () {
        function NavigationInstruction(init) {
          _classCallCheck(this, NavigationInstruction);

          this.plan = null;
          this.options = {};

          Object.assign(this, init);

          this.params = this.params || {};
          this.viewPortInstructions = {};

          var ancestorParams = [];
          var current = this;
          do {
            var currentParams = Object.assign({}, current.params);
            if (current.config && current.config.hasChildRouter) {
              delete currentParams[current.getWildCardName()];
            }

            ancestorParams.unshift(currentParams);
            current = current.parentInstruction;
          } while (current);

          var allParams = Object.assign.apply(Object, [{}, this.queryParams].concat(ancestorParams));
          this.lifecycleArgs = [allParams, this.config, this];
        }

        NavigationInstruction.prototype.getAllInstructions = function getAllInstructions() {
          var instructions = [this];
          for (var key in this.viewPortInstructions) {
            var childInstruction = this.viewPortInstructions[key].childNavigationInstruction;
            if (childInstruction) {
              instructions.push.apply(instructions, childInstruction.getAllInstructions());
            }
          }

          return instructions;
        };

        NavigationInstruction.prototype.getAllPreviousInstructions = function getAllPreviousInstructions() {
          return this.getAllInstructions().map(function (c) {
            return c.previousInstruction;
          }).filter(function (c) {
            return c;
          });
        };

        NavigationInstruction.prototype.addViewPortInstruction = function addViewPortInstruction(viewPortName, strategy, moduleId, component) {
          var viewportInstruction = this.viewPortInstructions[viewPortName] = {
            name: viewPortName,
            strategy: strategy,
            moduleId: moduleId,
            component: component,
            childRouter: component.childRouter,
            lifecycleArgs: this.lifecycleArgs.slice()
          };

          return viewportInstruction;
        };

        NavigationInstruction.prototype.getWildCardName = function getWildCardName() {
          var wildcardIndex = this.config.route.lastIndexOf('*');
          return this.config.route.substr(wildcardIndex + 1);
        };

        NavigationInstruction.prototype.getWildcardPath = function getWildcardPath() {
          var wildcardName = this.getWildCardName();
          var path = this.params[wildcardName] || '';

          if (this.queryString) {
            path += '?' + this.queryString;
          }

          return path;
        };

        NavigationInstruction.prototype.getBaseUrl = function getBaseUrl() {
          if (!this.params) {
            return this.fragment;
          }

          var wildcardName = this.getWildCardName();
          var path = this.params[wildcardName] || '';

          if (!path) {
            return this.fragment;
          }

          return this.fragment.substr(0, this.fragment.lastIndexOf(path));
        };

        NavigationInstruction.prototype._commitChanges = function _commitChanges(waitToSwap) {
          var _this = this;

          var router = this.router;
          router.currentInstruction = this;

          if (this.previousInstruction) {
            this.previousInstruction.config.navModel.isActive = false;
          }

          this.config.navModel.isActive = true;

          router._refreshBaseUrl();
          router.refreshNavigation();

          var loads = [];
          var delaySwaps = [];

          var _loop = function _loop(viewPortName) {
            var viewPortInstruction = _this.viewPortInstructions[viewPortName];
            var viewPort = router.viewPorts[viewPortName];

            if (!viewPort) {
              throw new Error('There was no router-view found in the view for ' + viewPortInstruction.moduleId + '.');
            }

            if (viewPortInstruction.strategy === activationStrategy.replace) {
              if (waitToSwap) {
                delaySwaps.push({ viewPort: viewPort, viewPortInstruction: viewPortInstruction });
              }

              loads.push(viewPort.process(viewPortInstruction, waitToSwap).then(function (x) {
                if (viewPortInstruction.childNavigationInstruction) {
                  return viewPortInstruction.childNavigationInstruction._commitChanges();
                }
              }));
            } else {
              if (viewPortInstruction.childNavigationInstruction) {
                loads.push(viewPortInstruction.childNavigationInstruction._commitChanges(waitToSwap));
              }
            }
          };

          for (var viewPortName in this.viewPortInstructions) {
            _loop(viewPortName);
          }

          return Promise.all(loads).then(function () {
            delaySwaps.forEach(function (x) {
              return x.viewPort.swap(x.viewPortInstruction);
            });
            return null;
          }).then(function () {
            return prune(_this);
          });
        };

        NavigationInstruction.prototype._updateTitle = function _updateTitle() {
          var title = this._buildTitle();
          if (title) {
            this.router.history.setTitle(title);
          }
        };

        NavigationInstruction.prototype._buildTitle = function _buildTitle() {
          var separator = arguments.length <= 0 || arguments[0] === undefined ? ' | ' : arguments[0];

          var title = this.config.navModel.title || '';
          var childTitles = [];

          for (var viewPortName in this.viewPortInstructions) {
            var _viewPortInstruction = this.viewPortInstructions[viewPortName];

            if (_viewPortInstruction.childNavigationInstruction) {
              var childTitle = _viewPortInstruction.childNavigationInstruction._buildTitle(separator);
              if (childTitle) {
                childTitles.push(childTitle);
              }
            }
          }

          if (childTitles.length) {
            title = childTitles.join(separator) + (title ? separator : '') + title;
          }

          if (this.router.title) {
            title += (title ? separator : '') + this.router.title;
          }

          return title;
        };

        return NavigationInstruction;
      }());

      _export('NavigationInstruction', NavigationInstruction);

      _export('NavModel', NavModel = function () {
        function NavModel(router, relativeHref) {
          _classCallCheck(this, NavModel);

          this.isActive = false;
          this.title = null;
          this.href = null;
          this.relativeHref = null;
          this.settings = {};
          this.config = null;

          this.router = router;
          this.relativeHref = relativeHref;
        }

        NavModel.prototype.setTitle = function setTitle(title) {
          this.title = title;

          if (this.isActive) {
            this.router.updateTitle();
          }
        };

        return NavModel;
      }());

      _export('NavModel', NavModel);

      function isNavigationCommand(obj) {
        return obj && typeof obj.navigate === 'function';
      }

      _export('isNavigationCommand', isNavigationCommand);

      _export('Redirect', Redirect = function () {
        function Redirect(url) {
          var options = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];

          _classCallCheck(this, Redirect);

          this.url = url;
          this.options = Object.assign({ trigger: true, replace: true }, options);
          this.shouldContinueProcessing = false;
        }

        Redirect.prototype.setRouter = function setRouter(router) {
          this.router = router;
        };

        Redirect.prototype.navigate = function navigate(appRouter) {
          var navigatingRouter = this.options.useAppRouter ? appRouter : this.router || appRouter;
          navigatingRouter.navigate(this.url, this.options);
        };

        return Redirect;
      }());

      _export('Redirect', Redirect);

      _export('RedirectToRoute', RedirectToRoute = function () {
        function RedirectToRoute(route) {
          var params = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];
          var options = arguments.length <= 2 || arguments[2] === undefined ? {} : arguments[2];

          _classCallCheck(this, RedirectToRoute);

          this.route = route;
          this.params = params;
          this.options = Object.assign({ trigger: true, replace: true }, options);
          this.shouldContinueProcessing = false;
        }

        RedirectToRoute.prototype.setRouter = function setRouter(router) {
          this.router = router;
        };

        RedirectToRoute.prototype.navigate = function navigate(appRouter) {
          var navigatingRouter = this.options.useAppRouter ? appRouter : this.router || appRouter;
          navigatingRouter.navigateToRoute(this.route, this.params, this.options);
        };

        return RedirectToRoute;
      }());

      _export('RedirectToRoute', RedirectToRoute);

      _export('RouterConfiguration', RouterConfiguration = function () {
        function RouterConfiguration() {
          _classCallCheck(this, RouterConfiguration);

          this.instructions = [];
          this.options = {};
          this.pipelineSteps = [];
        }

        RouterConfiguration.prototype.addPipelineStep = function addPipelineStep(name, step) {
          this.pipelineSteps.push({ name: name, step: step });
          return this;
        };

        RouterConfiguration.prototype.addAuthorizeStep = function addAuthorizeStep(step) {
          return this.addPipelineStep('authorize', step);
        };

        RouterConfiguration.prototype.addPreActivateStep = function addPreActivateStep(step) {
          return this.addPipelineStep('preActivate', step);
        };

        RouterConfiguration.prototype.addPreRenderStep = function addPreRenderStep(step) {
          return this.addPipelineStep('preRender', step);
        };

        RouterConfiguration.prototype.addPostRenderStep = function addPostRenderStep(step) {
          return this.addPipelineStep('postRender', step);
        };

        RouterConfiguration.prototype.map = function map(route) {
          if (Array.isArray(route)) {
            route.forEach(this.map.bind(this));
            return this;
          }

          return this.mapRoute(route);
        };

        RouterConfiguration.prototype.mapRoute = function mapRoute(config) {
          this.instructions.push(function (router) {
            var routeConfigs = [];

            if (Array.isArray(config.route)) {
              for (var i = 0, ii = config.route.length; i < ii; ++i) {
                var _current = Object.assign({}, config);
                _current.route = config.route[i];
                routeConfigs.push(_current);
              }
            } else {
              routeConfigs.push(Object.assign({}, config));
            }

            var navModel = void 0;
            for (var _i = 0, _ii = routeConfigs.length; _i < _ii; ++_i) {
              var routeConfig = routeConfigs[_i];
              routeConfig.settings = routeConfig.settings || {};
              if (!navModel) {
                navModel = router.createNavModel(routeConfig);
              }

              router.addRoute(routeConfig, navModel);
            }
          });

          return this;
        };

        RouterConfiguration.prototype.mapUnknownRoutes = function mapUnknownRoutes(config) {
          this.unknownRouteConfig = config;
          return this;
        };

        RouterConfiguration.prototype.exportToRouter = function exportToRouter(router) {
          var instructions = this.instructions;
          for (var i = 0, ii = instructions.length; i < ii; ++i) {
            instructions[i](router);
          }

          if (this.title) {
            router.title = this.title;
          }

          if (this.unknownRouteConfig) {
            router.handleUnknownRoutes(this.unknownRouteConfig);
          }

          router.options = this.options;

          var pipelineSteps = this.pipelineSteps;
          if (pipelineSteps.length) {
            if (!router.isRoot) {
              throw new Error('Pipeline steps can only be added to the root router');
            }

            var pipelineProvider = router.pipelineProvider;
            for (var _i2 = 0, _ii2 = pipelineSteps.length; _i2 < _ii2; ++_i2) {
              var _pipelineSteps$_i = pipelineSteps[_i2];
              var _name = _pipelineSteps$_i.name;
              var step = _pipelineSteps$_i.step;

              pipelineProvider.addStep(_name, step);
            }
          }
        };

        return RouterConfiguration;
      }());

      _export('RouterConfiguration', RouterConfiguration);

      _export('activationStrategy', activationStrategy = {
        noChange: 'no-change',
        invokeLifecycle: 'invoke-lifecycle',
        replace: 'replace'
      });

      _export('activationStrategy', activationStrategy);

      _export('BuildNavigationPlanStep', BuildNavigationPlanStep = function () {
        function BuildNavigationPlanStep() {
          _classCallCheck(this, BuildNavigationPlanStep);
        }

        BuildNavigationPlanStep.prototype.run = function run(navigationInstruction, next) {
          return _buildNavigationPlan(navigationInstruction).then(function (plan) {
            navigationInstruction.plan = plan;
            return next();
          }).catch(next.cancel);
        };

        return BuildNavigationPlanStep;
      }());

      _export('BuildNavigationPlanStep', BuildNavigationPlanStep);

      function _buildNavigationPlan(instruction, forceLifecycleMinimum) {
        var prev = instruction.previousInstruction;
        var config = instruction.config;
        var plan = {};

        if ('redirect' in config) {
          var redirectLocation = _resolveUrl(config.redirect, getInstructionBaseUrl(instruction));
          if (instruction.queryString) {
            redirectLocation += '?' + instruction.queryString;
          }

          return Promise.reject(new Redirect(redirectLocation));
        }

        if (prev) {
          var newParams = hasDifferentParameterValues(prev, instruction);
          var pending = [];

          var _loop2 = function _loop2(viewPortName) {
            var prevViewPortInstruction = prev.viewPortInstructions[viewPortName];
            var nextViewPortConfig = config.viewPorts[viewPortName];

            if (!nextViewPortConfig) throw new Error('Invalid Route Config: Configuration for viewPort "' + viewPortName + '" was not found for route: "' + instruction.config.route + '."');

            var viewPortPlan = plan[viewPortName] = {
              name: viewPortName,
              config: nextViewPortConfig,
              prevComponent: prevViewPortInstruction.component,
              prevModuleId: prevViewPortInstruction.moduleId
            };

            if (prevViewPortInstruction.moduleId !== nextViewPortConfig.moduleId) {
              viewPortPlan.strategy = activationStrategy.replace;
            } else if ('determineActivationStrategy' in prevViewPortInstruction.component.viewModel) {
              var _prevViewPortInstruct;

              viewPortPlan.strategy = (_prevViewPortInstruct = prevViewPortInstruction.component.viewModel).determineActivationStrategy.apply(_prevViewPortInstruct, instruction.lifecycleArgs);
            } else if (config.activationStrategy) {
              viewPortPlan.strategy = config.activationStrategy;
            } else if (newParams || forceLifecycleMinimum) {
              viewPortPlan.strategy = activationStrategy.invokeLifecycle;
            } else {
              viewPortPlan.strategy = activationStrategy.noChange;
            }

            if (viewPortPlan.strategy !== activationStrategy.replace && prevViewPortInstruction.childRouter) {
              var path = instruction.getWildcardPath();
              var task = prevViewPortInstruction.childRouter._createNavigationInstruction(path, instruction).then(function (childInstruction) {
                viewPortPlan.childNavigationInstruction = childInstruction;

                return _buildNavigationPlan(childInstruction, viewPortPlan.strategy === activationStrategy.invokeLifecycle).then(function (childPlan) {
                  childInstruction.plan = childPlan;
                });
              });

              pending.push(task);
            }
          };

          for (var viewPortName in prev.viewPortInstructions) {
            _loop2(viewPortName);
          }

          return Promise.all(pending).then(function () {
            return plan;
          });
        }

        for (var _viewPortName in config.viewPorts) {
          plan[_viewPortName] = {
            name: _viewPortName,
            strategy: activationStrategy.replace,
            config: instruction.config.viewPorts[_viewPortName]
          };
        }

        return Promise.resolve(plan);
      }
      _export('_buildNavigationPlan', _buildNavigationPlan);

      _export('Router', Router = function () {
        function Router(container, history) {
          _classCallCheck(this, Router);

          this.parent = null;
          this.options = {};

          this.container = container;
          this.history = history;
          this.reset();
        }

        Router.prototype.reset = function reset() {
          var _this2 = this;

          this.viewPorts = {};
          this.routes = [];
          this.baseUrl = '';
          this.isConfigured = false;
          this.isNavigating = false;
          this.navigation = [];
          this.currentInstruction = null;
          this._fallbackOrder = 100;
          this._recognizer = new RouteRecognizer();
          this._childRecognizer = new RouteRecognizer();
          this._configuredPromise = new Promise(function (resolve) {
            _this2._resolveConfiguredPromise = resolve;
          });
        };

        Router.prototype.registerViewPort = function registerViewPort(viewPort, name) {
          name = name || 'default';
          this.viewPorts[name] = viewPort;
        };

        Router.prototype.ensureConfigured = function ensureConfigured() {
          return this._configuredPromise;
        };

        Router.prototype.configure = function configure(callbackOrConfig) {
          var _this3 = this;

          this.isConfigured = true;

          var result = callbackOrConfig;
          var config = void 0;
          if (typeof callbackOrConfig === 'function') {
            config = new RouterConfiguration();
            result = callbackOrConfig(config);
          }

          return Promise.resolve(result).then(function (c) {
            if (c && c.exportToRouter) {
              config = c;
            }

            config.exportToRouter(_this3);
            _this3.isConfigured = true;
            _this3._resolveConfiguredPromise();
          });
        };

        Router.prototype.navigate = function navigate(fragment, options) {
          if (!this.isConfigured && this.parent) {
            return this.parent.navigate(fragment, options);
          }

          return this.history.navigate(_resolveUrl(fragment, this.baseUrl, this.history._hasPushState), options);
        };

        Router.prototype.navigateToRoute = function navigateToRoute(route, params, options) {
          var path = this.generate(route, params);
          return this.navigate(path, options);
        };

        Router.prototype.navigateBack = function navigateBack() {
          this.history.navigateBack();
        };

        Router.prototype.createChild = function createChild(container) {
          var childRouter = new Router(container || this.container.createChild(), this.history);
          childRouter.parent = this;
          return childRouter;
        };

        Router.prototype.generate = function generate(name, params) {
          var options = arguments.length <= 2 || arguments[2] === undefined ? {} : arguments[2];

          var hasRoute = this._recognizer.hasRoute(name);
          if ((!this.isConfigured || !hasRoute) && this.parent) {
            return this.parent.generate(name, params);
          }

          if (!hasRoute) {
            throw new Error('A route with name \'' + name + '\' could not be found. Check that `name: \'' + name + '\'` was specified in the route\'s config.');
          }

          var path = this._recognizer.generate(name, params);
          var rootedPath = _createRootedPath(path, this.baseUrl, this.history._hasPushState, options.absolute);
          return options.absolute ? '' + this.history.getAbsoluteRoot() + rootedPath : rootedPath;
        };

        Router.prototype.createNavModel = function createNavModel(config) {
          var navModel = new NavModel(this, 'href' in config ? config.href : config.route);
          navModel.title = config.title;
          navModel.order = config.nav;
          navModel.href = config.href;
          navModel.settings = config.settings;
          navModel.config = config;

          return navModel;
        };

        Router.prototype.addRoute = function addRoute(config, navModel) {
          validateRouteConfig(config);

          if (!('viewPorts' in config) && !config.navigationStrategy) {
            config.viewPorts = {
              'default': {
                moduleId: config.moduleId,
                view: config.view
              }
            };
          }

          if (!navModel) {
            navModel = this.createNavModel(config);
          }

          this.routes.push(config);

          var path = config.route;
          if (path.charAt(0) === '/') {
            path = path.substr(1);
          }
          var caseSensitive = config.caseSensitive === true;
          var state = this._recognizer.add({ path: path, handler: config, caseSensitive: caseSensitive });

          if (path) {
            var _settings = config.settings;
            delete config.settings;
            var withChild = JSON.parse(JSON.stringify(config));
            config.settings = _settings;
            withChild.route = path + '/*childRoute';
            withChild.hasChildRouter = true;
            this._childRecognizer.add({
              path: withChild.route,
              handler: withChild,
              caseSensitive: caseSensitive
            });

            withChild.navModel = navModel;
            withChild.settings = config.settings;
          }

          config.navModel = navModel;

          if ((navModel.order || navModel.order === 0) && this.navigation.indexOf(navModel) === -1) {
            if (!navModel.href && navModel.href !== '' && (state.types.dynamics || state.types.stars)) {
              throw new Error('Invalid route config: dynamic routes must specify an href to be included in the navigation model.');
            }

            if (typeof navModel.order !== 'number') {
              navModel.order = ++this._fallbackOrder;
            }

            this.navigation.push(navModel);
            this.navigation = this.navigation.sort(function (a, b) {
              return a.order - b.order;
            });
          }
        };

        Router.prototype.hasRoute = function hasRoute(name) {
          return !!(this._recognizer.hasRoute(name) || this.parent && this.parent.hasRoute(name));
        };

        Router.prototype.hasOwnRoute = function hasOwnRoute(name) {
          return this._recognizer.hasRoute(name);
        };

        Router.prototype.handleUnknownRoutes = function handleUnknownRoutes(config) {
          var _this4 = this;

          if (!config) {
            throw new Error('Invalid unknown route handler');
          }

          this.catchAllHandler = function (instruction) {
            return _this4._createRouteConfig(config, instruction).then(function (c) {
              instruction.config = c;
              return instruction;
            });
          };
        };

        Router.prototype.updateTitle = function updateTitle() {
          if (this.parent) {
            return this.parent.updateTitle();
          }

          this.currentInstruction._updateTitle();
        };

        Router.prototype.refreshNavigation = function refreshNavigation() {
          var nav = this.navigation;

          for (var i = 0, length = nav.length; i < length; i++) {
            var _current2 = nav[i];
            if (!_current2.href) {
              _current2.href = _createRootedPath(_current2.relativeHref, this.baseUrl, this.history._hasPushState);
            }
          }
        };

        Router.prototype._refreshBaseUrl = function _refreshBaseUrl() {
          if (this.parent) {
            var baseUrl = this.parent.currentInstruction.getBaseUrl();
            this.baseUrl = this.parent.baseUrl + baseUrl;
          }
        };

        Router.prototype._createNavigationInstruction = function _createNavigationInstruction() {
          var url = arguments.length <= 0 || arguments[0] === undefined ? '' : arguments[0];
          var parentInstruction = arguments.length <= 1 || arguments[1] === undefined ? null : arguments[1];

          var fragment = url;
          var queryString = '';

          var queryIndex = url.indexOf('?');
          if (queryIndex !== -1) {
            fragment = url.substr(0, queryIndex);
            queryString = url.substr(queryIndex + 1);
          }

          var results = this._recognizer.recognize(url);
          if (!results || !results.length) {
            results = this._childRecognizer.recognize(url);
          }

          var instructionInit = {
            fragment: fragment,
            queryString: queryString,
            config: null,
            parentInstruction: parentInstruction,
            previousInstruction: this.currentInstruction,
            router: this,
            options: {
              compareQueryParams: this.options.compareQueryParams
            }
          };

          if (results && results.length) {
            var first = results[0];
            var _instruction = new NavigationInstruction(Object.assign({}, instructionInit, {
              params: first.params,
              queryParams: first.queryParams || results.queryParams,
              config: first.config || first.handler
            }));

            if (typeof first.handler === 'function') {
              return evaluateNavigationStrategy(_instruction, first.handler, first);
            } else if (first.handler && 'navigationStrategy' in first.handler) {
              return evaluateNavigationStrategy(_instruction, first.handler.navigationStrategy, first.handler);
            }

            return Promise.resolve(_instruction);
          } else if (this.catchAllHandler) {
            var _instruction2 = new NavigationInstruction(Object.assign({}, instructionInit, {
              params: { path: fragment },
              queryParams: results && results.queryParams,
              config: null }));

            return evaluateNavigationStrategy(_instruction2, this.catchAllHandler);
          }

          return Promise.reject(new Error('Route not found: ' + url));
        };

        Router.prototype._createRouteConfig = function _createRouteConfig(config, instruction) {
          var _this5 = this;

          return Promise.resolve(config).then(function (c) {
            if (typeof c === 'string') {
              return { moduleId: c };
            } else if (typeof c === 'function') {
              return c(instruction);
            }

            return c;
          }).then(function (c) {
            return typeof c === 'string' ? { moduleId: c } : c;
          }).then(function (c) {
            c.route = instruction.params.path;
            validateRouteConfig(c);

            if (!c.navModel) {
              c.navModel = _this5.createNavModel(c);
            }

            return c;
          });
        };

        _createClass(Router, [{
          key: 'isRoot',
          get: function get() {
            return !this.parent;
          }
        }]);

        return Router;
      }());

      _export('Router', Router);

      _export('CanDeactivatePreviousStep', CanDeactivatePreviousStep = function () {
        function CanDeactivatePreviousStep() {
          _classCallCheck(this, CanDeactivatePreviousStep);
        }

        CanDeactivatePreviousStep.prototype.run = function run(navigationInstruction, next) {
          return processDeactivatable(navigationInstruction.plan, 'canDeactivate', next);
        };

        return CanDeactivatePreviousStep;
      }());

      _export('CanDeactivatePreviousStep', CanDeactivatePreviousStep);

      _export('CanActivateNextStep', CanActivateNextStep = function () {
        function CanActivateNextStep() {
          _classCallCheck(this, CanActivateNextStep);
        }

        CanActivateNextStep.prototype.run = function run(navigationInstruction, next) {
          return processActivatable(navigationInstruction, 'canActivate', next);
        };

        return CanActivateNextStep;
      }());

      _export('CanActivateNextStep', CanActivateNextStep);

      _export('DeactivatePreviousStep', DeactivatePreviousStep = function () {
        function DeactivatePreviousStep() {
          _classCallCheck(this, DeactivatePreviousStep);
        }

        DeactivatePreviousStep.prototype.run = function run(navigationInstruction, next) {
          return processDeactivatable(navigationInstruction.plan, 'deactivate', next, true);
        };

        return DeactivatePreviousStep;
      }());

      _export('DeactivatePreviousStep', DeactivatePreviousStep);

      _export('ActivateNextStep', ActivateNextStep = function () {
        function ActivateNextStep() {
          _classCallCheck(this, ActivateNextStep);
        }

        ActivateNextStep.prototype.run = function run(navigationInstruction, next) {
          return processActivatable(navigationInstruction, 'activate', next, true);
        };

        return ActivateNextStep;
      }());

      _export('ActivateNextStep', ActivateNextStep);

      _export('RouteLoader', RouteLoader = function () {
        function RouteLoader() {
          _classCallCheck(this, RouteLoader);
        }

        RouteLoader.prototype.loadRoute = function loadRoute(router, config, navigationInstruction) {
          throw Error('Route loaders must implement "loadRoute(router, config, navigationInstruction)".');
        };

        return RouteLoader;
      }());

      _export('RouteLoader', RouteLoader);

      _export('LoadRouteStep', LoadRouteStep = function () {
        LoadRouteStep.inject = function inject() {
          return [RouteLoader];
        };

        function LoadRouteStep(routeLoader) {
          _classCallCheck(this, LoadRouteStep);

          this.routeLoader = routeLoader;
        }

        LoadRouteStep.prototype.run = function run(navigationInstruction, next) {
          return loadNewRoute(this.routeLoader, navigationInstruction).then(next).catch(next.cancel);
        };

        return LoadRouteStep;
      }());

      _export('LoadRouteStep', LoadRouteStep);

      _export('PipelineProvider', PipelineProvider = function () {
        PipelineProvider.inject = function inject() {
          return [Container];
        };

        function PipelineProvider(container) {
          _classCallCheck(this, PipelineProvider);

          this.container = container;
          this.steps = [BuildNavigationPlanStep, CanDeactivatePreviousStep, LoadRouteStep, this._createPipelineSlot('authorize'), CanActivateNextStep, this._createPipelineSlot('preActivate', 'modelbind'), DeactivatePreviousStep, ActivateNextStep, this._createPipelineSlot('preRender', 'precommit'), CommitChangesStep, this._createPipelineSlot('postRender', 'postcomplete')];
        }

        PipelineProvider.prototype.createPipeline = function createPipeline() {
          var _this6 = this;

          var pipeline = new Pipeline();
          this.steps.forEach(function (step) {
            return pipeline.addStep(_this6.container.get(step));
          });
          return pipeline;
        };

        PipelineProvider.prototype.addStep = function addStep(name, step) {
          var found = this.steps.find(function (x) {
            return x.slotName === name || x.slotAlias === name;
          });
          if (found) {
            found.steps.push(step);
          } else {
            throw new Error('Invalid pipeline slot name: ' + name + '.');
          }
        };

        PipelineProvider.prototype._createPipelineSlot = function _createPipelineSlot(name, alias) {
          var _class6, _temp;

          var PipelineSlot = (_temp = _class6 = function () {
            function PipelineSlot(container) {
              _classCallCheck(this, PipelineSlot);

              this.container = container;
            }

            PipelineSlot.prototype.getSteps = function getSteps() {
              var _this7 = this;

              return PipelineSlot.steps.map(function (x) {
                return _this7.container.get(x);
              });
            };

            return PipelineSlot;
          }(), _class6.inject = [Container], _class6.slotName = name, _class6.slotAlias = alias, _class6.steps = [], _temp);


          return PipelineSlot;
        };

        return PipelineProvider;
      }());

      _export('PipelineProvider', PipelineProvider);

      logger = LogManager.getLogger('app-router');

      _export('AppRouter', AppRouter = function (_Router) {
        _inherits(AppRouter, _Router);

        AppRouter.inject = function inject() {
          return [Container, History, PipelineProvider, EventAggregator];
        };

        function AppRouter(container, history, pipelineProvider, events) {
          _classCallCheck(this, AppRouter);

          var _this8 = _possibleConstructorReturn(this, _Router.call(this, container, history));

          _this8.pipelineProvider = pipelineProvider;
          _this8.events = events;
          return _this8;
        }

        AppRouter.prototype.reset = function reset() {
          _Router.prototype.reset.call(this);
          this.maxInstructionCount = 10;
          if (!this._queue) {
            this._queue = [];
          } else {
            this._queue.length = 0;
          }
        };

        AppRouter.prototype.loadUrl = function loadUrl(url) {
          var _this9 = this;

          return this._createNavigationInstruction(url).then(function (instruction) {
            return _this9._queueInstruction(instruction);
          }).catch(function (error) {
            logger.error(error);
            restorePreviousLocation(_this9);
          });
        };

        AppRouter.prototype.registerViewPort = function registerViewPort(viewPort, name) {
          var _this10 = this;

          _Router.prototype.registerViewPort.call(this, viewPort, name);

          if (!this.isActive) {
            var _ret5 = function () {
              var viewModel = _this10._findViewModel(viewPort);
              if ('configureRouter' in viewModel) {
                if (!_this10.isConfigured) {
                  var _ret6 = function () {
                    var resolveConfiguredPromise = _this10._resolveConfiguredPromise;
                    _this10._resolveConfiguredPromise = function () {};
                    return {
                      v: {
                        v: _this10.configure(function (config) {
                          return viewModel.configureRouter(config, _this10);
                        }).then(function () {
                          _this10.activate();
                          resolveConfiguredPromise();
                        })
                      }
                    };
                  }();

                  if ((typeof _ret6 === 'undefined' ? 'undefined' : _typeof(_ret6)) === "object") return _ret6.v;
                }
              } else {
                _this10.activate();
              }
            }();

            if ((typeof _ret5 === 'undefined' ? 'undefined' : _typeof(_ret5)) === "object") return _ret5.v;
          } else {
            this._dequeueInstruction();
          }

          return Promise.resolve();
        };

        AppRouter.prototype.activate = function activate(options) {
          if (this.isActive) {
            return;
          }

          this.isActive = true;
          this.options = Object.assign({ routeHandler: this.loadUrl.bind(this) }, this.options, options);
          this.history.activate(this.options);
          this._dequeueInstruction();
        };

        AppRouter.prototype.deactivate = function deactivate() {
          this.isActive = false;
          this.history.deactivate();
        };

        AppRouter.prototype._queueInstruction = function _queueInstruction(instruction) {
          var _this11 = this;

          return new Promise(function (resolve) {
            instruction.resolve = resolve;
            _this11._queue.unshift(instruction);
            _this11._dequeueInstruction();
          });
        };

        AppRouter.prototype._dequeueInstruction = function _dequeueInstruction() {
          var _this12 = this;

          var instructionCount = arguments.length <= 0 || arguments[0] === undefined ? 0 : arguments[0];

          return Promise.resolve().then(function () {
            if (_this12.isNavigating && !instructionCount) {
              return undefined;
            }

            var instruction = _this12._queue.shift();
            _this12._queue.length = 0;

            if (!instruction) {
              return undefined;
            }

            _this12.isNavigating = true;
            instruction.previousInstruction = _this12.currentInstruction;

            if (!instructionCount) {
              _this12.events.publish('router:navigation:processing', { instruction: instruction });
            } else if (instructionCount === _this12.maxInstructionCount - 1) {
              logger.error(instructionCount + 1 + ' navigation instructions have been attempted without success. Restoring last known good location.');
              restorePreviousLocation(_this12);
              return _this12._dequeueInstruction(instructionCount + 1);
            } else if (instructionCount > _this12.maxInstructionCount) {
              throw new Error('Maximum navigation attempts exceeded. Giving up.');
            }

            var pipeline = _this12.pipelineProvider.createPipeline();

            return pipeline.run(instruction).then(function (result) {
              return processResult(instruction, result, instructionCount, _this12);
            }).catch(function (error) {
              return { output: error instanceof Error ? error : new Error(error) };
            }).then(function (result) {
              return resolveInstruction(instruction, result, !!instructionCount, _this12);
            });
          });
        };

        AppRouter.prototype._findViewModel = function _findViewModel(viewPort) {
          if (this.container.viewModel) {
            return this.container.viewModel;
          }

          if (viewPort.container) {
            var container = viewPort.container;

            while (container) {
              if (container.viewModel) {
                this.container.viewModel = container.viewModel;
                return container.viewModel;
              }

              container = container.parent;
            }
          }
        };

        return AppRouter;
      }(Router));

      _export('AppRouter', AppRouter);
    }
  };
});