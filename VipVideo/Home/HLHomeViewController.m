//
//  HLHomeViewController.m
//  VipVideo
//
//  Created by LHL on 2017/10/23.
//  Copyright © 2017年 SV. All rights reserved.
//

#import "HLHomeViewController.h"
#import "NSView+ZCAddition.h"
#import <WebKit/WebKit.h>
#import "VipURLManager.h"
#import "NSString+HLAddition.h"
#import "HLCollectionViewItem.h"
#import "AppDelegate.h"
#pragma mark ----

//http://www.5ifxw.com/vip/

#define NSCollectionViewWidth   75
#define NSCollectionViewHeight  50

@interface HLHomeViewController()<WKNavigationDelegate, WKUIDelegate, NSCollectionViewDataSource, NSCollectionViewDelegate>{
    BOOL isLoading;
    BOOL isChanged;
    WKWebViewConfiguration *secondConfiguration;
}

@property (nonatomic, strong) WKWebView         *webView;
@property (nonatomic, strong) NSMutableArray    *modelsArray;
@property (nonatomic, strong) NSMutableArray    *buttonsArray;
@property (nonatomic, strong) NSString          *currentUrl;
@property (nonatomic, strong) NSMutableArray    *historyList;
@property (nonatomic, strong) NSCollectionView  *collectionView;
@property (nonatomic, strong) NSScrollView      *scrollView;
@property (nonatomic, strong) VipUrlItem        *selectedObject;
//@property (nonatomic, strong) NSWindow          *secondWindow; // 第二弹窗
//@property (nonatomic, strong) WKWebView         *secondWebView;// 第二个弹窗的webview
@end;

@implementation HLHomeViewController

- (void)dealloc{
    [[NSNotificationCenter defaultCenter] removeObserver:self];
}

- (void)viewDidLayout{
    [super viewDidLayout];
    self.scrollView.frame = CGRectMake(0, 0, CGRectGetWidth(self.view.bounds), self.isFullScreen ? 0 : NSCollectionViewHeight);
    self.webView.frame = CGRectMake(0, self.scrollView.bottom+0.5, self.view.width, self.view.height - self.scrollView.bottom-0.5);
}

- (void)setIsFullScreen:(BOOL)isFullScreen{
    _isFullScreen = isFullScreen;
    
    [self.view setNeedsLayout:YES];
}

- (void)viewDidLoad {
    [super viewDidLoad];
    
    self.view.layer.backgroundColor = NSColor.lightGrayColor.CGColor;
    [self.view setNeedsDisplay:YES];
    
    self.modelsArray = [NSMutableArray array];
    self.buttonsArray = [NSMutableArray array];
            
    WKWebViewConfiguration *configuration = [[WKWebViewConfiguration alloc] init];
    // 启动驱动，否则flash不可播
    configuration.preferences.plugInsEnabled = YES;
    configuration.preferences.javaEnabled = YES;
    if (@available(macOS 10.12, *)) {
        configuration.userInterfaceDirectionPolicy = WKUserInterfaceDirectionPolicySystem;
    } else {
        // Fallback on earlier versions
    }
    if (@available(macOS 10.11, *)) {
        configuration.allowsAirPlayForMediaPlayback = YES;
    } else {
        // Fallback on earlier versions
    }
    configuration.preferences.javaScriptCanOpenWindowsAutomatically = YES;
    
    self.webView = [[WKWebView alloc] initWithFrame:self.view.bounds configuration:configuration];
    self.webView.UIDelegate = self;
    self.webView.allowsBackForwardNavigationGestures = YES;
    self.webView.navigationDelegate = self;
    
    [self.view addSubview:self.webView];
    
    [self registerNotification];
    
    if (![VipURLManager sharedInstance].networkLoaded) {
        [self configurationDefaultData];
    } else {
        [[NSNotificationCenter defaultCenter] postNotificationName:KHLVipVideoRequestSuccess object:nil];
    }
    
    [self refreshVideoModel:self.selectedObject];
    [self creatgeCollectionView];
}

- (void)creatgeCollectionView{
    CGRect frame = CGRectMake(0, CGRectGetHeight(self.view.bounds)-50, CGRectGetWidth(self.view.bounds), NSCollectionViewHeight);
    CGRect bound = CGRectZero;;

    NSCollectionView *collectionView = [[NSCollectionView alloc] initWithFrame:bound];
    NSCollectionViewFlowLayout *layout = [[NSCollectionViewFlowLayout alloc] init];
    layout.minimumLineSpacing = 0;
    layout.minimumInteritemSpacing = 0;
    layout.scrollDirection = NSCollectionViewScrollDirectionHorizontal;
    layout.itemSize = CGSizeMake(NSCollectionViewWidth, NSCollectionViewHeight);
    collectionView.collectionViewLayout = layout;
    collectionView.dataSource = self;
    collectionView.delegate = self;
    [collectionView registerClass:[HLCollectionViewItem class] forItemWithIdentifier:@"HLCollectionViewItemID"];
    
    NSClipView *clip = [[NSClipView alloc] initWithFrame:bound];
    clip.documentView = collectionView;
    
    NSScrollView *scrollView = [[NSScrollView alloc] initWithFrame:frame];
    scrollView.contentView = clip;

    [self.view addSubview:scrollView];

    self.scrollView = scrollView;
    self.collectionView = collectionView;
}

- (void)registerNotification{
    [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(vipVideoCurrentApiWillChange:) name:KHLVipVideoWillChangeCurrentApi object:nil];
    [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(vipVideoCurrentApiDidChange:) name:KHLVipVideoDidChangeCurrentApi object:nil];
    [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(videoRequestSuccess:) name:KHLVipVideoRequestSuccess object:nil];
    [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(vipVideoDidCopyCurrentURL:) name:KHLVipVideoDidCopyCurrentURL object:nil];
    [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(vipVideoGoBackCurrentURL:) name:KHLVipVideoGoBackCurrentURL object:nil];
    [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(vipVideoGoForwardCurrentURL:) name:KHLVipVideoGoForwardCurrentURL object:nil];
}

- (void)configurationDefaultData{
        
    [self createButtonsForData];
}

- (void)createButtonsForData{
    [self.collectionView reloadData];
    
    
    for (NSButton *button in self.buttonsArray) {
        [button removeFromSuperview];
    }
    
    for (NSInteger i=0; i< self.modelsArray.count; i++) {
        VipUrlItem *item = self.modelsArray[i];
        NSVideoButton *button = [[NSVideoButton alloc] init];
        [button setBezelStyle:NSBezelStyleShadowlessSquare];
        [button setTarget:self];
        [button setTitle:item.title];
//        [button setAction:@selector(buttonClicked:)];
        button.model = item;
        [self.view addSubview:button];
        [self.buttonsArray addObject:button];
        if (i==0) {
            self.selectedObject = item;
            self.selectedObject.selected = YES;
//            _selectedButton = button;
//            _selectedButton.highlighted = YES;
        }
    }
    [self.view setNeedsLayout:YES];
}

- (void)webView:(WKWebView *)webView decidePolicyForNavigationAction:(WKNavigationAction *)navigationAction decisionHandler:(void (^)(WKNavigationActionPolicy))decisionHandler {
    NSString *requestUrl = navigationAction.request.URL.absoluteString;
    //如果是跳转一个新页面
    if (navigationAction.targetFrame == nil) {
        [webView loadRequest:navigationAction.request];
    }
    if (navigationAction.request.URL.absoluteString.length > 0) {
        
        // 拦截广告
        if ([requestUrl containsString:@"ynjczy.net"] ||
            [requestUrl containsString:@"ylbdtg.com"] ||
            [requestUrl containsString:@"662820.com"] ||
            [requestUrl containsString:@"api.vparse.org"] ||
            [requestUrl containsString:@"hyysvip.duapp.com"] ||
            [requestUrl containsString:@"f.qcwzx.net.cn"] ||
            [requestUrl containsString:@"adx.dlads.cn"] ||
            [requestUrl containsString:@"dlads.cn"] ||
            [requestUrl containsString:@"wuo.8h2x.com"]
            ) {
            decisionHandler(WKNavigationActionPolicyCancel);
            return;
        }
        if ([requestUrl hasSuffix:@".m3u8"]) {
            NSArray *urls = [requestUrl componentsSeparatedByString:@"url="];
            [VipURLManager sharedInstance].m3u8Url = urls.lastObject;
        }
        else {
            [VipURLManager sharedInstance].m3u8Url = nil;
        }
        NSLog(@"request.URL.absoluteString = %@",requestUrl);
        
        if ([requestUrl hasPrefix:@"https://aweme.snssdk.co"] || [requestUrl hasPrefix:@"http://aweme.snssdk.co"]) {
            decisionHandler(WKNavigationActionPolicyCancel);
            [VipURLManager sharedInstance].m3u8Url = requestUrl;
            [[VipURLManager sharedInstance] nativePlay:nil];
            return;
        }
        
        if ([[requestUrl URLDecodedString] hasSuffix:@"clearAllHistory"]) {
            NSAlert *alert = [[NSAlert alloc] init];
            alert.alertStyle = NSAlertStyleWarning;
            alert.messageText = @"是否清空所有历史记录";
            [alert addButtonWithTitle:@"清空"];
            [alert addButtonWithTitle:@"取消"];
            [alert beginSheetModalForWindow:[NSApplication sharedApplication].keyWindow completionHandler:^(NSModalResponse returnCode) {
                if (returnCode == NSAlertFirstButtonReturn) {
                    [self clearAllHistory];
                }
            }];
        }
    }
    decisionHandler(WKNavigationActionPolicyAllow);
}

- (WKWebView *)webView:(WKWebView *)webView createWebViewWithConfiguration:(WKWebViewConfiguration *)configuration forNavigationAction:(WKNavigationAction *)navigationAction windowFeatures:(WKWindowFeatures *)windowFeatures{
    secondConfiguration = configuration;
   
    NSUInteger windowStyleMask = NSClosableWindowMask | NSMiniaturizableWindowMask | NSResizableWindowMask | NSTitledWindowMask;
    NSWindow *secondWindow = [[NSWindow alloc] initWithContentRect:CGRectMake(0, 0, 800, 600) styleMask:windowStyleMask backing:NSBackingStoreBuffered defer:NO];
    
    WKWebView *secondWebView = [[WKWebView alloc] initWithFrame:self.view.bounds configuration:secondConfiguration];
    
    [secondWebView setAutoresizingMask:NSViewWidthSizable | NSViewHeightSizable];

    [secondWindow setContentView:secondWebView];

    [secondWindow makeKeyAndOrderFront:self];

    AppDelegate *delegate = (id)[NSApplication sharedApplication].delegate;
    [delegate.windonwArray addObject:secondWindow];
    
    [secondWebView loadRequest:navigationAction.request];

    return secondWebView;
}

- (void)webView:(WKWebView *)webView didFinishNavigation:(null_unspecified WKNavigation *)navigation
{
    [VipURLManager sharedInstance].finalUrl = webView.URL.absoluteString;
    [self saveHistoryUrl:webView.URL.absoluteString title:webView.title];
}

- (void)webView:(WKWebView *)webView didFailNavigation:(null_unspecified WKNavigation *)navigation withError:(NSError *)error
{
    [VipURLManager sharedInstance].finalUrl = webView.URL.absoluteString;
}


- (void)vipVideoCurrentApiDidChange:(NSNotification *)notification{
    
    __weak typeof(self) mySelf = self;
    [self.webView evaluateJavaScript:@"document.location.href" completionHandler:^(id _Nullable url, NSError * _Nullable error) {
        NSString *originUrl = [[url componentsSeparatedByString:@"url="] lastObject];
        
        if (![url hasPrefix:@"http"]) {
            return ;
        }
        
        NSString *finalUrl = [NSString stringWithFormat:@"%@%@", [[VipURLManager sharedInstance] currentVipApi]?:@"",originUrl?:@""];
//        NSLog(@"finalUrl = %@", finalUrl);
        NSString * encodingString = [finalUrl stringByAddingPercentEscapesUsingEncoding:NSUTF8StringEncoding];
        NSURLRequest *request = [NSURLRequest requestWithURL:[NSURL URLWithString:encodingString]];
        [mySelf.webView loadRequest:request];
    }];
}


- (void)vipVideoDidCopyCurrentURL:(NSNotification *)notification{
    NSPasteboard *pasteboard = [NSPasteboard generalPasteboard];
    [pasteboard clearContents];
    [pasteboard setString:self.webView.URL.absoluteString forType:NSPasteboardTypeString];
}

- (void)vipVideoGoBackCurrentURL:(NSNotification *)notification{
    if ([self.webView canGoBack]) {
        [self.webView goBack];
    }
}

- (void)vipVideoGoForwardCurrentURL:(NSNotification *)notification{
    if ([self.webView canGoForward]) {
        [self.webView goForward];
    }
}

#pragma mark - Notification

- (void)refreshVideoModel:(VipUrlItem *)model{
    
    if ([model.url isEqualToString:@"history"]) {
        [self.webView loadHTMLString:self.getHistoryHtml baseURL:nil];
    }
    else{
        NSString * encodingString = [model.url stringByAddingPercentEscapesUsingEncoding:NSUTF8StringEncoding];
        NSURLRequest *request = [NSURLRequest requestWithURL:[NSURL URLWithString:encodingString]];
        
        [self.webView loadRequest:request];
    }
}

- (void)videoRequestSuccess:(NSNotification *)notification{
    
    NSArray *platformArray = [VipURLManager sharedInstance].platformItemsArray;
    if (platformArray.count == 0) {
        return;
    }
    [self.modelsArray removeAllObjects];
    for (NSButton *button in self.buttonsArray) {
        [button removeFromSuperview];
    }
    [self.buttonsArray removeAllObjects];
    
    [self.modelsArray addObjectsFromArray:platformArray];
    
    [self createButtonsForData];
    
    [self refreshVideoModel:self.selectedObject];
}

- (void)vipVideoCurrentApiWillChange:(NSNotification *)notification{
    NSString *url = [[_currentUrl componentsSeparatedByString:@"url="] lastObject];
    if ([url hasPrefix:@"http"]) {
        _currentUrl = url;
    }
}

#pragma mark - history
- (NSString *)getHistoryHtml{
    
    NSArray *historyList = self.getHistoryList;
    NSString *history = nil; //@"我是历史记录。 <a href='http://www.baidu.com'> http://www.baidu.com </a>";

    if (historyList.count > 0) {
        NSMutableString *string = [NSMutableString string];
        [string appendString:@"<a href=#clearAllHistory> 点击清理历史记录 </a></br></br>"];
        for (NSDictionary *dict in historyList) {
            [string appendFormat:@"%@ <a href = %@> %@ </a></br>", [NSString compareCurrentTime:[NSDate dateWithTimeIntervalSince1970:[dict[@"timestamp"] integerValue]]] ,dict[@"url"], dict[@"title"]];
        }
        history = string;
    }else {
        history = @"暂无历史记录";
    }
    
    NSString *string = [NSString stringWithFormat:@"<html>\
                        <title> 历史记录 </title>\
                        <body>\
                        %@\
                        </body>\
                        </html>", history];
    
    return string;
}

- (void)saveHistoryUrl:(NSString *)url title:(NSString *)title{
    if (url.length > 0 && title.length > 0 && [url hasPrefix:@"http"]) {
        NSArray *old_history = [[NSUserDefaults standardUserDefaults] objectForKey:@"HLWebViewHistroy"];
        NSMutableArray *new_histroy = [NSMutableArray arrayWithArray:old_history];
        NSDictionary *dict = @{@"url":url,
                               @"title":title,
                               @"timestamp": @(time(NULL))
        };
        [new_histroy insertObject:dict atIndex:0];
        [[NSUserDefaults standardUserDefaults] setObject:new_histroy forKey:@"HLWebViewHistroy"];
    }
}

- (NSArray *)getHistoryList{
    NSArray *old_history = [[NSUserDefaults standardUserDefaults] objectForKey:@"HLWebViewHistroy"];
    return old_history;
}

- (void)clearAllHistory{
    [[NSUserDefaults standardUserDefaults] removeObjectForKey:@"HLWebViewHistroy"];
    [self.webView loadHTMLString:self.getHistoryHtml baseURL:nil];
}

#pragma mark - CollectionView
- (NSInteger)collectionView:(NSCollectionView *)collectionView numberOfItemsInSection:(NSInteger)section {
    return self.modelsArray.count;
}

- (NSCollectionViewItem *)collectionView:(NSCollectionView *)collectionView itemForRepresentedObjectAtIndexPath:(NSIndexPath *)indexPath {
    HLCollectionViewItem *item = [collectionView makeItemWithIdentifier:@"HLCollectionViewItemID" forIndexPath:indexPath];
    if (indexPath.item < self.modelsArray.count) {
        item.object = self.modelsArray[indexPath.item];
    }

    __weak typeof(self) weakSelf = self;
        
    [item setItemBlock:^(VipUrlItem * _Nonnull object, NSIndexPath *mIndex) {
        __strong typeof(self) strongSelf = weakSelf;
        
        strongSelf.selectedObject.selected = NO;
        
        [VipURLManager sharedInstance].currentIndex = 0;
        [strongSelf refreshVideoModel:object];
        
        strongSelf.selectedObject = object;
        strongSelf.selectedObject.selected = YES;
        NSIndexSet *set = [NSIndexSet indexSetWithIndex:mIndex.item];
        [strongSelf.collectionView reloadSections:set];

    }];
    return item;
}

// https://blog.csdn.net/zzzili/article/details/9078739


@end
