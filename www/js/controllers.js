angular.module('drive.controllers', ['drive.config'])
    .controller('AppCtrl', function($scope, $ionicModal, $ionicPlatform, Accounts, $cordovaToast, XIMSS, $prefs, $cordovaDevice, $timeout) {
	$scope.mpshow = false;
	$scope.iface = {};
	$scope.iface.search = false;
	$scope.iface.searchString = "";
	$scope.openAccountsModal = function () {
	    $ionicModal.fromTemplateUrl('templates/accounts.html', {
		scope: $scope,
		animation: 'slide-in-up'
	    }).then(function(modal) {
		$scope.accountsModal = modal;
		$scope.accountsModal.show();
	    });
	}
	$scope.closeAccountsModal = function () {
	    $scope.accountsModal.remove();
	}

	$ionicPlatform.ready(function() {
	    $timeout(function () {
		$scope.mpshow = true;
	    }, 1000);
	    Accounts.all().then(
		function (accounts) {
		    if (! accounts[0]) {
			$scope.addAccount();
		    }
		},
		function (error) {
		    $cordovaToast.show(error, 'long', 'bottom');
		}
	    );
	    if ($cordovaDevice.getPlatform().toLowerCase() == 'android')
		screen.unlockOrientation();
	    // Calculate image sizes
	    var pixelRatio = window.devicePixelRatio || 1;
	    var screenWidth = Math.ceil(window.innerWidth * pixelRatio);
	    var screenHeight = Math.ceil(window.innerHeight * pixelRatio);

	    window.maxImageSize = screenWidth;
	    if (screenHeight > screenWidth) window.maxImageSize = screenHeight;

	    var imagesPerRow = 2;
	    if (window.innerWidth >= 800) imagesPerRow = 3;
	    if (window.innerWidth >= 1024) imagesPerRow = 4;
	    if (window.innerWidth >= 1440) imagesPerRow = 5;
	    var imagesPerCol = 2;
	    if (window.innerHeight >= 800) imagesPerCol = 3;
	    if (window.innerHeight >= 1024) imagesPerCol = 4;
	    if (window.innerHeight >= 1440) imagesPerCol = 5;
	    window.maxThumbnailSize = Math.ceil(screenWidth / imagesPerRow);
	    if (screenWidth / imagesPerRow <= screenHeight / imagesPerCol) window.maxThumbnailSize = Math.ceil(screenHeight / imagesPerCol);
	});
	// Global account management functions
	// show add account dialg
	$scope.addAccount = function () {
	    $scope.accountData = {};
	    $scope.accountData.useSSL = true;
	    $ionicModal.fromTemplateUrl('templates/addAccount.html', {
		scope: $scope,
		animation: 'slide-in-up',
		backdropClickToClose: false,
		hardwareBackButtonClose: false
	    }).then(function(modal) {
		$scope.addAccountsModal = modal;
		if ($scope.accountsModal && $scope.accountsModal.isShown()) {
		    $scope.accountsModal.hide();
		}
		$scope.addAccountsModal.show();
	    });
	};
	// close add account dialog
	$scope.closeAddAccountModal = function () {
	    $scope.addAccountsModal.remove();
	    if ($scope.accountsModal) {
		$scope.accountsModal.remove();
	    }
	};
	// add the account
	$scope.doAddAccount = function () {
	    var account = $scope.accountData.accountName;
	    var server = $scope.accountData.accountServer;
	    var password = $scope.accountData.accountPassword;
	    var ssl = $scope.accountData.useSSL;
	    if (! server ) {
		server = account.split("@")[1];
	    }
	    XIMSS.checkAccount(account, server, password, ssl).then(
		function () {
		    Accounts.add(account, server, password, ssl).then(function (response) {
		    	$scope.closeAddAccountModal();
		    	$cordovaToast.show("Account added.", 'long', 'bottom');
			Accounts.lastAdded().then(function (response) {
			    $prefs.set("lastUsedAccount", response["last_insert_rowid()"]);
			    $scope.$broadcast('forceReload');
			});
		    });
		},
		function (error) {
		    $cordovaToast.show(error, 'long', 'bottom');
		}
	    );
	};
	$scope.$on('forceReloadAll', function(event, args) {
	    $scope.$broadcast('forceReload');
	});
	// Readable file size
	$scope.sizeReadable = function (bytes) {
	    if(bytes == 0 || ! bytes) return '0B';
	    var k = 1024;
	    var sizes = ['B', 'kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
	    var i = Math.floor(Math.log(bytes) / Math.log(k));
	    return Math.round(10 * bytes / Math.pow(k, i))/10  + sizes[i];
	};
    })
    .controller('HomeCtrl', function($scope, $stateParams, $ionicActionSheet, $ionicPlatform, $ionicLoading, basePath, XIMSS, $timeout, $filter, $cordovaFile, $prefs, $ionicScrollDelegate, $ionicPopup, $cordovaFileTransfer, $cordovaToast, Accounts, $cordovaClipboard, $ionicModal, Opener, Downloader, $rootScope, $state, ImageResizer, $cordovaSocialSharing, $q, $cordovaNetwork) {
	$scope.searches = {};
	$scope.path = $stateParams.path;
	var folders = $scope.path.split("/");
	$scope.title = folders[folders.length - 2] || 'Pronto!Drive';
	$scope.iface.grid = false;
	$scope.insideSub = false;
	if ($stateParams.path.match(/^~/))
	    $scope.insideSub = true;
	// List folders
	$scope.listFolder = function () {
	    // Start with simple debounce
	    var now = new Date().getTime();
	    if ($scope.listFolderDebounce && now - $scope.listFolderDebounce < 300) {
		return;
	    }
	    $scope.listFolderDebounce = now;
	    basePath.updateBase().then(
		function (base) {
		    $scope.base = base;
		}
	    );
	    $ionicLoading.show({
	    	templateUrl: 'templates/loading.html'
	    });
	    XIMSS.folderListing($stateParams.path || "").then(
		function (folderItems) {
		    if (!folderItems) {
			$scope.nothing = true;
		    }
		    $scope.$broadcast('scroll.refreshComplete');
		    $timeout($ionicLoading.hide, 100);
		    $scope.requestComplete = true;
		    $scope.noConnection = false;
		    if (folderItems && folderItems[0])
			var items = folderItems.sort(compareFilesAndFolders);
		    if (! $stateParams.path) {
		    	items = $filter('filter')(items, function (item, index) {
		    	    if (item._directory == "private/" && (item._fileName == "IM" || item._fileName == "_upload" || item._fileName == "settings" || item._fileName == "logs"))
		    		return false;
		    	    return true;
		    	});
			XIMSS.checkSubsRequests().then(
			    function (result) {
				$scope.subsAlets = result;
			    }
			);
		    }
		    $scope.folderItems = items;
		    $timeout(function () {
			$scope.folderItems = $scope.findLocal(items);
		    });
		    $scope.listSubscriptions();
		},
		function (error) {
		    $scope.$broadcast('scroll.refreshComplete');
		    $timeout($ionicLoading.hide, 100);
		    $scope.requestComplete = true;
		    if (error == 0) {
			$scope.noConnection = true;
		    }
		    $scope.folderItems = []; // Empty the folder items for the current view
		    $scope.listSubscriptions(); // List subscriptions even if no files
		}
	    );
	};
	// Find local files
	$scope.findLocal = function (fileList) {
	    if (fileList && fileList.length) {
		if ( !$stateParams.path.match(/^\~/) ) {
		    // Get shared files
 		    XIMSS.getAllAttributes(fileList).then(
			function (response) {
			    if (response)
				for (var i = 0; i < response.length; i++) {
				    if (response[i].ACL) {
					fileList[response[i]._id].acl = response[i].ACL;
				    }
				    if (response[i].accessPwd) {
					fileList[response[i]._id].shared = response[i].accessPwd.key;
				    }
				}
			},
			function (error) {
			    // $cordovaToast.show(error, 'long', 'bottom');
			}
		    );
		}
		// Get folders sizes
 		XIMSS.getFoldersInfo(fileList).then(
		    function (response) {
			$scope.folderSize = {};
			if (response) {
			    for (var i = 0; i < response.length; i++) {
				var splitPath = response[i]._directory.split("/");
				var name = splitPath[splitPath.length - 1];
				$scope.folderSize[name] = response[i]._size;
			    }
			}
		    }
		);
	    }
	    // Find local downloaded files
	    var fullpath = basePath.base + $scope.path;
	    var folder = fullpath.substring(0, fullpath.lastIndexOf('/', fullpath.length - 2) + 1);
	    var dir = fullpath.substring(fullpath.lastIndexOf('/', fullpath.length - 2) + 1);
	    $cordovaFile.listDir(folder, dir).then(
	    	function (ok) {
		    var localFiles = ok.filter( function (item) {
			return item.isFile
		    }).map(function (item) {
			return item.name
		    });
		    angular.forEach(fileList, function(value, key) {
			if (localFiles.indexOf(value._fileName) > -1) {
	    		    value.local = true;
	    		    var ext = value._fileName.substring(value._fileName.lastIndexOf('.')+1).toLowerCase();
	    		    if ($scope.checkAudioFormat(ext)) {
	    			value.audioplay = basePath.base + $scope.path + value._fileName;
	    		    }
	    		    if (ext == "jpg" || ext == "jpeg" || ext == "png") {
	    			value.img = true
	    		    }
			}
		    });
	    	},
	    	function (error) {
	    	    console.log("Error: " + JSON.stringify(error));
	    	}
	    );

	    return fileList;
	};

	$scope.listSubscriptions = function () {
	    // Listing Subscriptions
	    if ((! $stateParams.path) || $stateParams.path.match(/^\~/)) {
		$scope.subscriptions = [];
		XIMSS.listSubscriptions().then(
		    function (subs) {
			if (!subs) return;
			// Extract only the users for the index page
			if (! $stateParams.path) {
			    $scope.subscriptions = subs.map(function (item) {
				return item._fileName.split("/")[0];
			    }).filter(function (value, index, self) {
				return self.indexOf(value) === index;
			    });
			}
			// Get the files and folders for subscription
			var subfolders = subs.map(function (item) {
			    return item._fileName;
			});
			subfolders = subfolders.map(function (item) {
			    return item.split($stateParams.path)[1];
			}).filter(function (item) {
			    if (item)
				return true;
			    return false;
			});
			XIMSS.checkSubsFiles(subfolders, $stateParams.path).then(function (newElements) {
			    if (! $scope.folderItems)
				$scope.folderItems = [];
			    // check if file/folder already listed
			    $scope.folderItems = $scope.folderItems.filter( function (item) {
				return newElements.map(function (i) {return i._fileName}).indexOf(item._fileName) < 0;
			    });
			    $scope.folderItems = $scope.folderItems.concat(newElements);
			    $scope.folderItems = $scope.folderItems.sort(compareFilesAndFolders);
			    $scope.folderItems = $scope.findLocal($scope.folderItems);
			});
		    });
	    };
	};

	$scope.discardACL = function (acl) {
	    XIMSS.removeSubsRequest(acl).then(
		function (result) {
		    $scope.subsAlets = $scope.subsAlets.filter(function (item) { return item != acl });
		},
		function (err) {
		    $cordovaToast.show(err, 'long', 'bottom');
		});
	};
	$scope.acceptACL = function (acl) {
	    XIMSS.acceptSubsRequest(acl).then(function () {
		$scope.subsAlets = $scope.subsAlets.filter(function (item) { return item != acl });
		$scope.$broadcast('forceReload');
	    },function () {
		$cordovaToast.show(err, 'long', 'bottom');
	    });
	};

	// Get icon types
	$scope.getIcon = function (item) {
	    if (item) {
		var name = item._fileName || item.name;
		if (item._type == "directory" || item.isDirectory) return "ion-folder positive";
		if (name.match(/\.(png|jpg|jpeg|gif|bmp|tif|tiff|svg|psd)$/i)) {
		    return "fa fa-file-image-o";
		} else if (name.match(/\.(mp3|ogg|wav|flac|acc|oga|m4a)$/i)) {
		    return "fa fa-file-audio-o";
		}
		else if (name.match(/\.(avi|mpeg|mp4|mov|ogv|webm|flv|mpg)$/i))
		    return "fa fa-file-video-o";
		else if (name.match(/\.(zip|tar|tgz|bz|gz|7z|arj|rar)$/i))
		    return "fa fa-file-archive-o";
		else if (name.match(/\.(xml|html|htm)$/i))
		    return "fa fa-file-code-o";
		else if (name.match(/\.(pdf)$/i))
		    return "fa fa-file-pdf-o icon-color-pdf";
		else if (name.match(/\.(apk)$/i))
		    return "fa fa-android  icon-color-android";
		else if (name.match(/\.(txt)$/i))
		    return "fa fa-file-text-o";
		else if (name.match(/\.(doc|docx|odt|ott|fodt|uot|rdf|dot)$/i))
		    return "fa fa-file-word-o icon-color-word";
		else if (name.match(/\.(xls|ods|ots|fods|uos|xlsx|xlt|csv)$/i))
		    return "fa fa-file-excel-o icon-color-excel";
		else if (name.match(/\.(odp|otp|fodp|ppt|pptx|ppsx|potm|pps|pot)$/i))
		    return "fa fa-file-powerpoint-o icon-color-powerpint";
	    }
	    return "fa fa-file-o";
	};

	$scope.showGlobalAction = function () {
	    $scope.hideGlobalAction = $ionicActionSheet.show({
		buttons: [
		    {text: "Create folder"},
		    {text: "Upload file"}
		],
		cancelText: 'Cancel',
		buttonClicked: function(index) {
		    if (index == 0) {
			$scope.createFolder($scope.path);
		    } else if ( index == 1 ) {
			$scope.uploadHere($scope.path);
		    }
		    $scope.hideGlobalAction();
		}
	    });
	};


	$scope.fileAction = function (file) {
	    var fullPath = file._fileName;
	    if ($stateParams.path) {
		fullPath = $stateParams.path + "/" + file._fileName;
	    }
	    fullPath = basePath.base + fullPath;
	    var buttons = [];
	    var baseIndex = 0;
	    var hideSheet;
	    // If it is a file
	    if (file._size) {
		var actionOptions = {};
		if (file._directory.match(/^~/)) {
		    if (file.subscription) {
			buttons.push({text: "Unsubscribe"});
			baseIndex = 1;
		    } else {
		    baseIndex = 2;
		    }
		} else {
		    buttons.push({text: "Access control"});
		    buttons.push({text: "Share"});
		}
		// Define file action options
		actionOptions = {
		    buttons: buttons,
		    titleText: file._fileName,
		    cancelText: 'Cancel',
		    buttonClicked: function(index) {
			if (baseIndex + index == 0) {
			    $scope.showUpdateACL(file);
			} else if (baseIndex + index == 1) {
			    if (file.subscription) {
				$scope.unsubscribe(file);
			    } else {
				$scope.updateAccessPwd(file);
			    }
			} else if (baseIndex + index == 2) {
			    Downloader.download(file, fullPath, $scope).then(
				function (result) {
				    $cordovaToast.show(result, 'long', 'bottom');
				    $timeout(function () {
					$scope.checkImageAndScale(basePath.base + $scope.path + file._fileName, file);
				    });
				},
				function (error) {
				    // $cordovaToast.show(error, 'long', 'bottom');
				}
			    );
			} else if (baseIndex + index == 3) {
			    Opener.open(fullPath);
			}
			hideSheet();
		    },
		    destructiveButtonClicked: function() {
			$cordovaFile.removeFile(fullPath.substring(0,fullPath.lastIndexOf('/') + 1), file._fileName).then(function(result) {
			    $cordovaToast.show("File deleted.", 'long', 'bottom');
			    file.local = false;
			    file.img = false;
			    hideSheet();
			}, function(err) {
			    $cordovaToast.show(err, 'long', 'bottom');
			});
			var ext = file._fileName.substring(file._fileName.lastIndexOf('.')+1).toLowerCase();
			if (ext == "jpg" || ext == "jpeg" || ext == "png") {
			    $cordovaFile.removeFile(fullPath.substring(0,fullPath.lastIndexOf('/') + 1) + "/.thumb/", file._fileName);
			    $cordovaFile.removeFile(fullPath.substring(0,fullPath.lastIndexOf('/') + 1) + "/.preview/", file._fileName);
			}
		    }
		};
		if (file.local) {
		    actionOptions.buttons.push({ text: 'reDownload' });
		    actionOptions.buttons.push({ text: 'Open with' });
		    actionOptions.destructiveText = "Delete local file";
	    	} else {
		    actionOptions.buttons.push({ text: 'Download' });
		}
	    } else {
		var buttons = [
		    {
			text: "Access control"
		    },
		    {
			text: "Share"
		    }
		];
		if (file.subscription) {
		    buttons = [
			{
			    text: "Unsubscribe"
			}
		    ];
		}
		var actionOptions = {
		    buttons: buttons,
 		    titleText: file._fileName,
		    cancelText: 'Cancel',
		    buttonClicked: function(index) {
			if (index == 0) {
			    if (file.subscription) {
				$scope.unsubscribe(file);
			    } else {
				$scope.showUpdateACL(file);
			    }
			    hideSheet();
			} else if (index == 1) {
			    $scope.updateAccessPwd(file);
			    hideSheet();
			}
		    }
		};
	    }
	    //actionOptions.destructiveText = "Delete local file";
	    hideSheet = $ionicActionSheet.show(actionOptions);
	};

	$scope.unsubscribe = function (item) {
	    XIMSS.unsubscribe($stateParams.path + "/" + item._fileName).then(
		function () {
		    $cordovaToast.show("Unsubscribed", 'long', 'bottom');
 		    $scope.$broadcast('forceReload');
		},
		function (err) {
		    $cordovaToast.show(err, 'long', 'bottom');
		}
	    );
	};

	$scope.updateAccessPwd = function (file) {
	    Accounts.getLastUsed().then(
		function (account) {
		    var password = file.shared ? file.shared : Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 8);
		    var filePath = ($stateParams.path ?  ($stateParams.path + "/") : "") + file._fileName;
		    $scope.shareFilePath = "private/" + filePath;
		    $scope.shareFile = file;
		    $scope.sharePassword = password;
		    if (file._size) {
			$scope.formData = {
			    shared: true,
			    link: "http://" + account.host + "/~" + account.account + "/protected/pwd/" + password + "/" + filePath
			};
		    } else {
			$scope.formData = {
			    shared: true,
			    link: "http://" + account.host + "/filebrowser.wcgp?subDir=~" + account.account + "/protected/pwd/" + password + "/" + filePath
			};
		    }
		    if (!file.shared) {
			$scope.shareChanged();
		    }
		    var sharePopup = $ionicPopup.show({
			templateUrl: "templates/shareLink.html",
			title: 'Share',
			subTitle: file._fileName,
			scope: $scope,
			buttons: [
			    {text: 'Close'},
			    {
				text: 'Share',
				type: 'button-positive',
				onTap: function(e) {
				    e.preventDefault();
				    $cordovaSocialSharing.share(account.account + " has shared a file or folder with you:" , null, null, $scope.formData.link).then(function () {
					sharePopup.close();
				    }, function (err) {
					$cordovaToast.show(err, 'long', 'bottom');
				    });

				}
			    }
			]
		    });
		});
	};
	$scope.shareChanged = function () {

	    XIMSS.updateAccessPwd($scope.shareFilePath, $scope.formData.shared ? $scope.sharePassword : false).then(
		function (result) {
		    $scope.shareFile.shared = $scope.formData.shared?$scope.sharePassword:false;
		},
		function (err) {
		    $cordovaToast.show(err, 'long', 'bottom');
		}
	    );
	};

	$scope.copyLink = function (link) {
	    $cordovaClipboard.copy(link).then(function () {
		$cordovaToast.show("Link copied to clipboard.", 'long', 'bottom');
	    });
	};

	$scope.showUpdateACL = function (item) {
	    $scope.acls = [];
	    $ionicModal.fromTemplateUrl('templates/accessControl.html', {
		scope: $scope,
	    }).then(function(modal) {
		if (item.acl) {
		    $scope.acls = JSON.parse(JSON.stringify(item.acl.subKey));
		    if(Object.prototype.toString.call($scope.acls) !== '[object Array]' ) {
			$scope.acls = [$scope.acls];
		    }
		}
		$scope.newACL = {__text: "lr"};
		$scope.file = item;
		$scope.accessModal = modal;
		$scope.accessModal.show();
	    });
	};
	$scope.updateACLClose = function () {
	    $scope.accessModal.hide().then(function () {
		$scope.accessModal.remove();
	    });
	};
	$scope.updateACL = function (file) {
	    if ( this.newACL._key && this.newACL.__text ) {
		if (!this.acls)
		    this.acls = [];
		this.acls.push(this.newACL);
	    };
	    this.acls = $filter('filter')(this.acls, function (item, index) {
		if (item._key && item.__text)
		    return true;
		return false;
	    });
	    XIMSS.updateACL(this.file._directory + this.file._fileName, this.acls).then(
		function (ok) {
		    $scope.updateACLClose();
		    file.acl = this.acls.length?{subKey: this.acls}:null;
		}.bind(this),
		function (error) {
		    $cordovaToast.show(error, 'long', 'bottom');
		}
	    );
	};

	$scope.doRefresh = function () {
	    // stop the refresh in 10 seconds anyway
	    $timeout(function() {
		$scope.$broadcast('scroll.refreshComplete');
	    }, 10000);
	    $scope.$broadcast('forceReload');
	};

	$scope.setGridView = function (state) {
	    $scope.iface.grid = state;
	    $prefs.set("gridView", state);
	}

	$scope.toggleFilter = function (what) {
	    // searches.folders?searches={}:searches={folders:true}
	    if (what == "folders") {
		if ($scope.searches.folders) {
		    $scope.searches = {};
		} else {
		    $scope.searches = {folders: true};
		}
	    } else if (what == "docs") {
		if ($scope.searches.docs) {
		    $scope.searches = {};
		} else {
		    $scope.searches = {docs: true};
		}
	    } else if (what == "sounds") {
		if ($scope.searches.sounds) {
		    $scope.searches = {};
		} else {
		    $scope.searches = {sounds: true};
		}
	    } else if (what == "images") {
		if ($scope.searches.images) {
		    $scope.searches = {};
		} else {
		    $scope.searches = {images: true};
		}
	    }
	    $ionicScrollDelegate.$getByHandle('contentScroll').scrollTop();
	}

	$scope.viewFile = function (folderItem) {
	    if (folderItem.local) {
		$scope.openFile(folderItem);
	    } else {
		Downloader.download(folderItem, basePath.base + $scope.path + folderItem._fileName, $scope).then(
		    function (result) {
			$cordovaToast.show(result, 'long', 'bottom');
	    		var ext = folderItem._fileName.substring(folderItem._fileName.lastIndexOf('.')+1).toLowerCase();
			if (ext == "jpg" || ext == "jpeg" || ext == "png") {
			    $timeout(function () {
				$scope.checkImageAndScale(basePath.base + $scope.path + folderItem._fileName, folderItem).then(function () {
				    $scope.openFile(folderItem);
				});
			    });
			} else {
			    $scope.openFile(folderItem);
			}
		    },
		    function (error) {
			// $cordovaToast.show(error, 'long', 'bottom');
		    }
		);
	    }

	}

	$scope.checkImageAndScale = function (file, item) {
	    var q = $q.defer();
	    var ext = file.substring(file.lastIndexOf('.') + 1).toLowerCase();
	    if (ext == "jpg" || ext == "jpeg" || ext == "png") {
		item.loading = true;
		var folder = file.substring(0,file.lastIndexOf('/') + 1);
		var filename = file.substring(file.lastIndexOf('/') + 1);
		$cordovaFile.createDir(folder, ".thumb", true).then( function () {
		    ImageResizer.resize(file, folder + ".thumb/" + filename, window.maxThumbnailSize, window.maxThumbnailSize).then( function () {
			$cordovaFile.createDir(folder, ".preview", true).then( function () {
			    ImageResizer.resize(file, folder + ".preview/" + filename, window.maxImageSize, window.maxImageSize).then( function () {
				item.loading = false;
				item.img = true;
				q.resolve(1);
			    });
			});
		    });
		});
	    }
	    return q.promise;
	}

	$scope.checkAudioFormat = function (format) {
	    var testEl = new Audio();
	    if ( testEl.canPlayType ) {
		mp3 = "" !== testEl.canPlayType( 'audio/mpeg;' );
		m4a = "" !== ( testEl.canPlayType( 'audio/x-m4a;' )
				|| testEl.canPlayType( 'audio/aac;' ) );
		ogg = "" !== testEl.canPlayType( 'audio/ogg; codecs="vorbis"' );
		wav = "" !== testEl.canPlayType( 'audio/wav; codecs="1"' );
		if (format == "mp3" && mp3)
		    return true;
		if (format == "m4a" && m4a)
		    return true;
		if ((format == "oga" || format == "ogg") && ogg)
		    return true;
		if (format == "wav" && wav)
		    return true;
	    }
	    return false;
	};
	$scope.checkVideoFormat = function (format) {
	    var testEl = document.createElement( "video" );
	    if ( testEl.canPlayType ) {
		mpeg4 = "" !== testEl.canPlayType( 'video/mp4; codecs="mp4v.20.8"' );
		h264 = "" !== ( testEl.canPlayType( 'video/mp4; codecs="avc1.42E01E"' )
				|| testEl.canPlayType( 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"' ) );
		ogg = "" !== testEl.canPlayType( 'application/ogg; codecs="theora"' );
		webm = "" !== testEl.canPlayType( 'video/webm; codecs="vp8, vorbis"' );
		if (format == "mp4" && mpeg4 && h264)
		    return true;
		if ((format == "ogv" || format == "ogg") && ogg)
		    return true;
		if (format == "webm" && webm)
		    return true;
	    }
	    return false;
	};

	$scope.openFile = function (folderItem) {
	    filePath = basePath.base + $scope.path + folderItem._fileName;
	    var ext = filePath.split('.').pop().toLowerCase();
	    if ((ext == "mp4" || ext == "ogg"  || ext == "ogv" || ext == "webm") && $scope.checkVideoFormat(ext)) {
		$scope.playVideo(folderItem);
	    } else if ((ext == "mp3" || ext == "wav" || ext == "oga" || ext == "ogg") && $scope.checkAudioFormat(ext)) {
		$scope.playAudio(folderItem);
	    } else if (ext == "jpg" || ext == "jpeg" || ext == "png") {
		images = $filter('filter')($scope.folderItems, function (item, index) {
		    if (item.local && item._fileName.match(/\.(jpg|jpeg|png)$/i) )
		    	return true;
		    return false;
		}).map(function (image) {
		    return  (basePath.base + $stateParams.path + image._fileName).replace(/\/+/g, "/");
		}).sort();
		var index = images.indexOf(filePath.replace(/\/+/g, "/"));
		$rootScope.images = images.map(function (item) {
		    return encodeURI(item.replace(/^(.*)\/(.*?)$/, "$1/.preview/$2"));
		});
		$state.go('imageviewer', {
			index: index
		});
	    } else {
		Opener.open(filePath);
	    }
	};


	// Create new folder

	$scope.createFolder = function (path) {
	    $scope.formData = {};
	    var addFolderPopup = $ionicPopup.show({
		templateUrl: "templates/addFolder.html",
		title: 'Create folder',
		subTitle: "Please enter a folder name:",
		scope: $scope,
		buttons: [
		    {text: 'Cancel'},
		    {
			text: 'Create',
			type: 'button-positive',
			onTap: function(e) {
			    e.preventDefault();
			    if ($scope.formData.folder) {
				XIMSS.createFolder(path + $scope.formData.folder).then(
				    function () {
					$scope.listFolder();
					addFolderPopup.close();
				    },
				    function (err) {
					$cordovaToast.show(err, 'long', 'bottom');
				    }
				);
			    } else {
				$cordovaToast.show("Please enter a folder name", 'long', 'bottom');
			    }
			}
		    }
		]
	    });
	};

	// Upload
	$scope.uploadHere = function (path) {
	    $scope.browseFolder(basePath.baseRoot);
	    $scope.uploadFiles = {};
	    $ionicModal.fromTemplateUrl('templates/browseFiles.html', {
		scope: $scope,
	    }).then(function(modal) {
		$scope.browseModal = modal;
		$scope.browseModal.show();
	    });
	};
	$scope.browseFolder = function (path) {
	    // TODO: Do a check for OS in order to replace
	    // path = path.replace("file://", "");
	    $ionicLoading.show({
	    	templateUrl: 'templates/loading.html'
	    });
	    $scope.browsePath = path;
	    var folder = path.substring(0, path.lastIndexOf('/', path.length - 2) + 1);
	    var dir = path.substring(path.lastIndexOf('/', path.length - 2) + 1);
	    $cordovaFile.listDir(folder, dir).then(
	    	function (ok) {
	    	    $scope.uploadItems = ok.sort(compareFilesAndFoldersUpload).filter(function (item) {
	    		if (item.name.match(/^\./))
	    		    return false;
	    		return true;
	    	    });
	    	    $ionicScrollDelegate.$getByHandle('uploadModalContent').scrollTop(true);
	    	    $ionicLoading.hide();
	    	},
	    	function (error) {
	    	    console.log("Error: " + JSON.stringify(error));
	    	}
	    );
	};

	$scope.closeUploadFiles = function () {
	    $scope.browseModal.hide().then(function () {
		$scope.browseModal.remove();
	    });
	};
	$scope.doUploadFiles = function () {
	    var files = [];
	    angular.forEach($scope.uploadFiles, function(value, key) {
		if (value)
		    this.push(key);
	    }, files);
	    if (!files.length) {
		$cordovaToast.show("Please select at least one file!", 'long', 'bottom');
		return;
	    }
	    $scope.uploadProgress = 0;
	    $scope.uploadCurrent = 0;
	    $scope.uploadCount = files.length;
	    var uploadPopup = $ionicPopup.show({
	    	templateUrl: "templates/uploading.html",
	    	title: 'Uploading',
	    	scope: $scope,
	    	buttons: [
		    { text: 'Cancel' }
		]
	    });
	    uploadPopup.then(function () {
		$scope.cancelUpload();
	    });
	    $scope.serialUploadFile(files, uploadPopup);
	};
	$scope.serialUploadFile = function (files, uploadPopup) {
	    $scope.uploadProgressCurrent = 0;
	    $scope.uploadFilename = "";
	    var progressChunks = 100/$scope.uploadCount;
	    if (files.length) {
		var file = files.shift();
		var fileName = file.replace(/^.*[\\\/]/, '');
		$scope.uploadFilename = decodeURIComponent(fileName);
		XIMSS.getSession().then(
		    function (sessionData) {
		    	var account = sessionData.account;
		    	var SessionID = sessionData.sessionID;
			var uploadID = makeId();
			var uploadPromice = $cordovaFileTransfer.upload((account.ssl?"https://":"http://") + account.host + (account.ssl?":9100":":8100") + "/Session/" + SessionID + "/UPLOAD/" + uploadID , file, {
			    "fileKey": "fileData",
			    "fileName": fileName
			}, true);
			uploadPromice.then(function(result) {
				// Success!
				var filePath = $scope.path + fileName;
				if (! filePath.match(/^~/))
				    filePath = "/private/" + filePath;
				XIMSS.fileStore(filePath, uploadID).then(
				    function (ok) {
					$scope.uploadCurrent = $scope.uploadCount - files.length;
 					$scope.serialUploadFile(files,uploadPopup);
				    },
				    function (err) {
 					uploadPopup.close();
					$cordovaToast.show(err, 'long', 'bottom');
				    }
				);
			    }, function(err) {
				// Error
 				uploadPopup.close();
			    }, function (progress) {
	    	    		$scope.uploadProgressCurrent = (Math.round(100 * progress.loaded/progress.total));
	    	    		$scope.uploadProgress = Math.round( ($scope.uploadCount - files.length - 1)*progressChunks + progressChunks * progress.loaded/progress.total );
			    });
			$scope.cancelUpload = uploadPromice.abort;
		    },
		    function (error) {
			$cordovaToast.show(error, 'long', 'bottom');
		    }
		);
	    } else {
		uploadPopup.close();
		$scope.closeUploadFiles();
		$scope.listFolder();
		// $state.go('tab.dash', {path: $stateParams.path});
	    }

	};
	$scope.levelUp = function (path) {
	    // Durty hack
	    return path + "../";
	}
	// END Upload files

	$scope.playAudio = function (file) {
	    // First stop playing videos
	    if ($scope.iface.videoControls && !$scope.iface.videoControls.paused()) {
		$scope.iface.videoControls.playFile();
	    }
	    var audios = $scope.folderItems.filter(function (item) {
		filePath = basePath.base + $scope.path + item._fileName;
		var ext = filePath.split('.').pop().toLowerCase();
		if (item.local && (ext == "mp3" || ext == "wav" || ext == "oga" || ext == "ogg") && $scope.checkAudioFormat(ext)) {
		    return true;
		}
		return false;
	    });
	    $scope.iface.audioControls.playFile(basePath.base + $scope.path, file, audios);
	}
	$scope.playVideo = function (file) {
	    // First stop playing audios
	    if ($scope.iface.audioControls && !$scope.iface.audioControls.paused()) {
		$scope.iface.audioControls.playFile();
	    }
	    var videos = $scope.folderItems.filter(function (item) {
		filePath = basePath.base + $scope.path + item._fileName;
		var ext = filePath.split('.').pop().toLowerCase();
		if (item.local && (ext == "mp4" || ext == "ogv" || ext == "webm") && $scope.checkVideoFormat(ext)) {
		    return true;
		}
		return false;
	    });
	    $scope.iface.videoControls.playFile(basePath.base + $scope.path, file, videos);
	};
	$ionicPlatform.ready(function() {
	    $scope.ready = true;
	    $scope.noconnection = $cordovaNetwork.isOffline();
	    StatusBar.show();
	    $prefs.get("gridView").then(
		function (state) {
		    $scope.iface.grid = state;
		}
	    );
	    if ($cordovaNetwork.isOnline()) {
		$scope.listFolder();
	    }
	});
	if ($scope.path) {
	    $scope.noconnection = $cordovaNetwork.isOffline();
	}
	$scope.$on('forceReload', function(event, args) {
	    $scope.listFolder();
	});
	document.addEventListener("online", function (e) {
	    if ($scope.ready) {
		$scope.listFolder();
	    }
	    $scope.noconnection = false;
	}, false);
    })
    .controller('AccountsCtrl', function($scope, $ionicModal, $timeout, $prefs, $cordovaToast, $ionicLoading, Accounts, XIMSS, $ionicPopup) {
	$scope.initSettings = function () {
	    Accounts.all().then(
		function (accounts) {
		    $scope.accounts = accounts;
		    // Get hea account's usage
		    XIMSS.allAccountsUsage(accounts).then(function (usage) {
			var keys = Object.keys(usage);
			for ( var i = 0; i < keys.length; i++ ) {
			    usage[keys[i]].percent = Math.round(usage[keys[i]]._size * 1000/usage[keys[i]]._sizeLimit)/10;
			}
			$scope.accountsUsage = usage;
		    });
		    $ionicLoading.hide();
		},
		function (error) {
		    $cordovaToast.show(error, 'long', 'bottom');
		}
	    );
	    $prefs.get("lastUsedAccount").then(
		function (selectedAccount) {
		    $scope.selectedAccount = selectedAccount;
		}
	    );
	};
	$scope.initSettings();
	$scope.selectAccount = function (id) {
	    $prefs.set("lastUsedAccount", id).then(
		function () {
		    XIMSS.sessionID = null;
		    $scope.$emit('forceReloadAll');
		    $scope.selectedAccount = id;
		}
	    );
	};
	$scope.editAccount = function (account) {
	    $scope.accountData = {
		accountName: account.account
	    };
	    $scope.account = account;
	    $scope.accountData.useSSL = account.ssl;
	    $ionicModal.fromTemplateUrl('templates/editAccount.html', {
		scope: $scope,
		animation: 'slide-in-up',
		backdropClickToClose: false,
		hardwareBackButtonClose: false
	    }).then(function(modal) {
		$scope.editAccountsModal = modal;
		// if ($scope.accountsModal && $scope.accountsModal.isShown()) {
		//     $scope.accountsModal.hide();
		// }
		$scope.editAccountsModal.show();
	    });
	};
	// close edit account dialog
	$scope.closeEditAccountModal = function () {
	    $scope.editAccountsModal.remove();
	    // if ($scope.accountsModal) {
	    // 	$scope.accountsModal.remove();
	    // }
	};
	$scope.doEditAccount = function () {
	    var newPassword = $scope.accountData.accountPassword?$scope.accountData.accountPassword:account.password;
	    XIMSS.checkAccount(account.account, account.host, newPassword, $scope.accountData.useSSL).then(
		function () {
		    Accounts.updateAccount(account.id, newPassword, $scope.accountData.useSSL).then(
			function () {
			    $cordovaToast.show("Account updated.", 'long', 'bottom');
			    $prefs.set("lastUsedAccount", account.id).then(
				function () {
				    XIMSS.sessionID = null;
				    $scope.$emit('forceReloadAll');
				    $scope.selectedAccount = account.id;
				}
			    );
			    $scope.closeEditAccountModal();
			},
			function (error) {
			    $cordovaToast.show(error, 'long', 'bottom');
			}
		    );
		},
		function (error) {
		    $cordovaToast.show(error, 'long', 'bottom');
		}
	    );
	};
	// Delete account
	$scope.deleteAccount = function (account) {
	    var confirmPopup = $ionicPopup.confirm({
		title: 'Remove account',
		template: 'Are you sure you want to remove ' + account.account + '?'
	    });
	    confirmPopup.then(function(res) {
		if(res) {
		    Accounts.remove(account.id).then(
			function () {
			    XIMSS.sessionID = null;
			    $scope.initSettings();
			    $prefs.get("lastUsedAccount").then(
				function (accId) {
				    if (accId = account.id) {
					Accounts.setLastUsedToExisitng();
					$scope.closeEditAccountModal();
					$timeout( function () {$scope.$emit('forceReloadAll');}, 100);
				    }
				}
			    );
			},
			function (err) {
			    $cordovaToast.show(err, 'long', 'bottom');
			}
		    );
		}
	    });
	};
	$scope.$on('forceReload', function(event, args) {
	    $scope.initSettings();
	});
    })

// Image viewer
    .controller('ImageViewerCtrl', function($scope, $stateParams, $rootScope, $ionicSlideBoxDelegate, $timeout, $ionicActionSheet, Opener) {
	// $scope.$root.tabsHidden = "tabs-item-hide";
	$scope.hiddenHeader = false;
	$scope.$on('$ionicView.beforeLeave', function () {
	    if (! StatusBar.isVisible) {
		StatusBar.show();
	    }
	});
	$scope.visibleImages = new Array($rootScope.images.length);
	$scope.visibleImages[$stateParams.index] = $rootScope.images[$stateParams.index];
	$timeout(function () {
	    $ionicSlideBoxDelegate.slide($stateParams.index, 1);
	}, 100);
	$scope.addPrevNextImage = function (currentVisible) {
	    currentVisible = parseInt(currentVisible);
	    if (currentVisible > 0 && $scope.visibleImages[currentVisible - 1] == null) {
		// Add one at begiining
		$scope.visibleImages[currentVisible - 1] = $rootScope.images[currentVisible - 1];
	    }
	    if (currentVisible < ($rootScope.images.length - 1) && $scope.visibleImages[currentVisible + 1] == null) {
		// Add one at end
		$scope.visibleImages[currentVisible + 1] = $rootScope.images[currentVisible + 1];
	    }
	};
	$timeout( function () {
	    $scope.addPrevNextImage($stateParams.index);
	}, 800);
	$scope.toggleFullscreen = function ($event) {
	    var slider = angular.element(document.querySelector( '.slider' ))[0];
	    if (StatusBar.isVisible) {
		StatusBar.hide();
		$scope.hiddenHeader = true;
	    } else {
		StatusBar.show();
		$scope.hiddenHeader = false;
	    }
	};
	$scope.slideChanged = function ($index) {
	    $timeout( function () {
		$scope.addPrevNextImage($index);
	    }, 500);
	};
	$scope.openWith = function () {
	    var hideSheet = $ionicActionSheet.show({
		buttons: [
		    { text: 'Open with' }
		],
		cancelText: 'Cancel',
		cancel: function() {
		},
		buttonClicked: function(index) {
		    Opener.open($rootScope.images[$ionicSlideBoxDelegate.currentIndex()].replace(/\/\.preview\//g, "/"));
		    hideSheet();
		}
	    });
	};
    })


function compareFilesAndFolders(a,b) {
    // if type differs
    if (a._size && b._type)
	return 1;
    if (a._type && b._size)
	return -1;
    // if type equals
    if (a._fileName > b._fileName)
	return 1;
    if (a._fileName < b._fileName)
	return -1;
    return 0;
}
function compareFilesAndFoldersUpload(a,b) {
    // if type differs
    if (a.isFile && b.isDirectory)
	return 1;
    if (a.isDirectory && b.isFile)
	return -1;
    // if type equals
    if (a.name.toLowerCase() > b.name.toLowerCase())
	return 1;
    if (a.name.toLowerCase() < b.name.toLowerCase())
	return -1;
    return 0;
}

function makeId () {
    var text = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for( var i=0; i < 8; i++ )
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    return text;
}
