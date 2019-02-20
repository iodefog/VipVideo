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
#import "HLVipWindowController.h"
#import "VipURLManager.h"


@interface NSVideoButton:NSButton

@property (nonatomic, strong) VipUrlItem *model;

@end

@implementation NSVideoButton

@end

#pragma mark ----

//http://www.5ifxw.com/vip/

@interface HLHomeViewController()<WKNavigationDelegate, WKUIDelegate>{
    BOOL isLoading;
    BOOL isChanged;
}

@property (nonatomic, strong) WKWebView *webView;
@property (nonatomic, strong) NSMutableArray *modelsArray;
@property (nonatomic, strong) NSMutableArray *buttonsArray;
@property (nonatomic, strong) NSVideoButton *selectedButton;
@property (nonatomic, strong) HLVipWindowController *newsWindow;
@property (nonatomic, strong) NSString       *currentUrl;

@end;

@implementation HLHomeViewController

- (void)dealloc{
    [[NSNotificationCenter defaultCenter] removeObserver:self];
}

- (void)viewDidLayout{
    [super viewDidLayout];
    CGFloat width = (CGRectGetWidth(self.view.bounds) - (self.buttonsArray.count+2)*10)/self.buttonsArray.count;
    NSButton *tempButton = nil;
    for (NSButton *button in self.buttonsArray) {
        button.frame = CGRectMake(tempButton.right+10, 5, width, self.isFullScreen ? 0 : 50);
        tempButton = button;
    }
    self.webView.frame = CGRectMake(0, tempButton.bottom, self.view.width, self.view.height - tempButton.bottom);
}

- (void)setIsFullScreen:(BOOL)isFullScreen{
    _isFullScreen = isFullScreen;
    
    [self.view setNeedsLayout:YES];
}

- (void)viewDidLoad {
    [super viewDidLoad];
    
    self.modelsArray = [NSMutableArray array];
    self.buttonsArray = [NSMutableArray array];
    
    WKWebViewConfiguration *configuration = [[WKWebViewConfiguration alloc] init];
    // 启动驱动，否则flash不可播
    configuration.preferences.plugInsEnabled = YES;
    configuration.preferences.javaEnabled = YES;
    configuration.preferences.javaScriptCanOpenWindowsAutomatically = YES;
    
    self.webView = [[WKWebView alloc] initWithFrame:self.view.bounds configuration:configuration];
    self.webView.UIDelegate = self;
    self.webView.navigationDelegate = self;
    
    [self.view addSubview:self.webView];
    
    [self registerNotification];
    
    if (![VipURLManager sharedInstance].networkLoaded) {
        [self configurationDefaultData];
    } else {
        [[NSNotificationCenter defaultCenter] postNotificationName:KHLVipVideoRequestSuccess object:nil];
    }
    
    [self refreshVideoModel:_selectedButton.model];
    
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
    for (NSButton *button in self.buttonsArray) {
        [button removeFromSuperview];
    }
    
    for (NSInteger i=0; i< self.modelsArray.count; i++) {
        VipUrlItem *item = self.modelsArray[i];
        NSVideoButton *button = [[NSVideoButton alloc] init];
        [button setBezelStyle:NSBezelStyleShadowlessSquare];
        [button setTarget:self];
        [button setTitle:item.title];
        [button setAction:@selector(buttonClicked:)];
        button.model = item;
        [self.view addSubview:button];
        [self.buttonsArray addObject:button];
        if (i==0) {
            _selectedButton = button;
            _selectedButton.highlighted = YES;
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
            [requestUrl containsString:@"dlads.cn"]
            ) {
            decisionHandler(WKNavigationActionPolicyCancel);
            return;
        }
        NSLog(@"request.URL.absoluteString = %@",requestUrl);
    }
    decisionHandler(WKNavigationActionPolicyAllow);
}

- (WKWebView *)webView:(WKWebView *)webView createWebViewWithConfiguration:(WKWebViewConfiguration *)configuration forNavigationAction:(WKNavigationAction *)navigationAction windowFeatures:(WKWindowFeatures *)windowFeatures{
    NSLog(@"createWebViewWithConfiguration  request     %@",navigationAction.request);
    if (!navigationAction.targetFrame.isMainFrame) {
        [webView loadRequest:navigationAction.request];
    }
    if (navigationAction.targetFrame == nil) {
        [webView loadRequest:navigationAction.request];
    }
    return nil;
}

- (void)webView:(WKWebView *)webView didFinishNavigation:(null_unspecified WKNavigation *)navigation
{
    [VipURLManager sharedInstance].finalUrl = webView.URL.absoluteString;
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
        
        NSURLRequest *request = [NSURLRequest requestWithURL:[NSURL URLWithString:finalUrl]];
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
    NSURLRequest *request = [NSURLRequest requestWithURL:[NSURL URLWithString:model.url]];
    [self.webView loadRequest:request];
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
    
    [self refreshVideoModel:_selectedButton.model];
}

- (void)vipVideoCurrentApiWillChange:(NSNotification *)notification{
    NSString *url = [[_currentUrl componentsSeparatedByString:@"url="] lastObject];
    if ([url hasPrefix:@"http"]) {
        _currentUrl = url;
    }
}



#pragma mark - Method
- (void)buttonClicked:(NSVideoButton *)sender{
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.1 *NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        sender.highlighted = YES;
    });
    if (sender == _selectedButton) {
        return;
    }
    
    _selectedButton.highlighted = NO;
    self.selectedButton = sender;
    
    [VipURLManager sharedInstance].currentIndex = 0;
    
    [self refreshVideoModel:_selectedButton.model];
    
}

@end
